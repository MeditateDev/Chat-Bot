const { ComponentDialog, DialogSet, DialogTurnStatus, WaterfallDialog } = require('botbuilder-dialogs');
const users = require('../services/user');
const service = require('../services/service');
const fileService = require('../services/file');
const { REPLACE_DIALOG_ACTION, PROVIDERS, AGENT_CONNECT_MSG, AGENT_DISCONNECT_MSG } = require('../constant');
const { ReplaceDialogAction } = require('./ReplaceDialogAction');
const { CustomFunctionDialog } = require('./CustomFunction');
const { CheckAttributeDialog } = require('./CheckAttribute');
const { SetAttributeDialog } = require('./SetAttribute');
const { HTTPRequestDialog } = require('./HTTPRequest');
const { TextPromptDialog } = require('./TextPrompt');
const { PlayPromptDialog } = require('./PlayPrompt');
const { SubActionDialog } = require('./SubAction');
const { SubflowDialog } = require('./Subflow');
const { SetLanguageDialog } = require('./SetLanguage');
const { TraceLogDialog } = require('./TraceLog');
const { TurnContext } = require('botbuilder-core');
const { tryParseJSON } = require('../util/helper');
const { MultipleChoicesDialog } = require('./MultipleChoices');
const { DatasetDialog } = require('./Dataset');
const { ChatGPTDialog } = require('./ChatGPT');
const { TransferDialog } = require('./Transfer');
const { OutReachDialog } = require('./Outreach');
const helper = require('../util/helper');
const { startHeartBeat, onReceivedMsg, sendMsg: amqpSendMsg } = require('../services/amqp');
const { FormDialog } = require('./Form');
const { TranslateDialog } = require('./Translate');
const { IntentRecognitionDialog } = require('./IntentRecognition');
const { CheckTimezoneDialog } = require('./CheckTimezone');
const { WaitDialog } = require('./WaitAction');
const { CustomActivityTypes } = require('../classes/CustomActivityTypes');
const { SendMailDialog } = require('./SendMail');
const { CMSDialog } = require('./CMS');
const { LLMsDialog } = require('./LLMs');
const { CardsDialog } = require('./Cards');

const CHAT = 'CHAT';

const moment = require('moment-timezone');
const { HangUpDialog } = require('./HangUp');
const { logRecognizeNoIntent, traceLog } = require('../services/callflowLog');
const { checkMultipleGrammars } = require('../services/grammars');
const { BuiltInDialog } = require('./Builtin');
const { MultipleConditionDialog } = require('./MultipleCondition');
const { CustomError } = require('../classes/CustomError');
const FlowData = require('../util/flowData');

class MainDialog extends ComponentDialog {
  constructor(conversationState, adapter, hookBot) {
    super(CHAT);

    this.hookBot = hookBot;
    this.adapter = adapter;
    this.conversationState = conversationState;
    this.conversationDataAccessor = this.conversationState.createProperty('conversationData');
    this.dialogState = conversationState.createProperty('DialogState');
    this.dialogSet = new DialogSet(this.dialogState);
    // this.dialogSet = new DialogSet(this.conversationDataAccessor);
    this.dialogSet.add(this);

    this.agentStateService = require('../services/agentState');

    this.addDialog(new ReplaceDialogAction(this));
    this.addDialog(new TextPromptDialog(this));
    this.addDialog(new CheckAttributeDialog(this));
    this.addDialog(new HTTPRequestDialog(this));
    this.addDialog(new PlayPromptDialog(this));
    this.addDialog(new SubActionDialog(this));
    this.addDialog(new SubflowDialog(this));
    this.addDialog(new CustomFunctionDialog(this));
    this.addDialog(new SetAttributeDialog(this));
    this.addDialog(new SetLanguageDialog(this));
    this.addDialog(new TraceLogDialog(this));
    this.addDialog(new MultipleChoicesDialog(this));
    this.addDialog(new DatasetDialog(this));
    this.addDialog(new ChatGPTDialog(this));
    this.addDialog(new TransferDialog(this));
    this.addDialog(new OutReachDialog(this));
    this.addDialog(new TranslateDialog(this));
    this.addDialog(new IntentRecognitionDialog(this));
    this.addDialog(new SendMailDialog(this));
    this.addDialog(new FormDialog(this));
    this.addDialog(new CheckTimezoneDialog(this));
    this.addDialog(new WaitDialog(this));
    this.addDialog(new CMSDialog(this));
    this.addDialog(new LLMsDialog(this));
    this.addDialog(new CardsDialog(this));
    this.addDialog(new HangUpDialog(this));
    this.addDialog(new BuiltInDialog(this));
    this.addDialog(new MultipleConditionDialog(this));

    this.addDialog(
      new WaterfallDialog('Main_Water_Fall', [
        (step) => this.agentStateService.sendAgentMsgToUser(step, this.adapter),
        this.BindContactMessage.bind(this),
        this.CheckReplaceFlow.bind(this),
        this.ReadFlow.bind(this),
      ])
    );

    startHeartBeat(() => {
      this.listenEventFromRabbitMQ();
    });

    this.initialDialogId = 'Main_Water_Fall';
  }

  async loadConversation(cached, context) {
    let changes = {};
    cached.state.eTag = '*';
    const storageKey = await this.conversationState.storageKey(context);
    changes[storageKey] = cached;
    await this.conversationState.storage.write(changes);
    context.turnState.set(this.conversationState.stateKey, cached);
  }

  async handleEventCustomData(turnContext) {
    const dialogContext = await this.dialogSet.createContext(turnContext);

    const user = users.findByActivity(turnContext.activity);
    const hasLastMsg = !!(user && user.lastMsg);

    const talkingWithAgent = await this.checkConnectAgentState(dialogContext);
    const channelData = {
      isTalkingWithAgent: talkingWithAgent,
      agentName: (user && user.agentName) || '',
    };
    await turnContext.sendActivity({
      type: CustomActivityTypes.ReplaceBotName,
      channelData,
    });

    console.log(
      `[MAIN] - HANDLE EVENT CUSTOM DATA FUNCTION - Sent replace bot name event to client - data: ${JSON.stringify(
        channelData
      )}`
    );

    if (hasLastMsg) {
      console.log(`User has repiled: ${user.lastMsg} => skip event customdata`);
      return;
    }

    if (talkingWithAgent) {
      console.log(`User is talking with agent => skip event custom data`);
      return;
    }

    console.log(
      `[MAIN] - RUN FUNCTION - HANDLE customData EVENT - This user not replied yet => end previous conv => begin new conv`
    );

    users.removeUser(turnContext.activity);
    await helper.endConversation(dialogContext);

    await this.conversationDataAccessor.get(turnContext, {
      user: users.add(turnContext.activity),
      data: {},
    });

    return await dialogContext.beginDialog(this.id);
  }

  async handleEventEndConversation(turnContext) {
    const dialogContext = await this.dialogSet.createContext(turnContext);

    if (turnContext.activity.name == 'endConversation' || turnContext.activity.name == 'user-endConversation') {
      if (turnContext.activity.channelId == 'WEB' && turnContext.activity.name == 'user-endConversation') {
        console.log(
          `[MAIN] - RUN FUNCTION - HANDLE user-endConversation EVENT => post msg to agent to notify that user is out`
        );
        await service.postChatClientEndConversation(turnContext.activity.from.id);
      }

      const conversationData = (await this.conversationDataAccessor.get(turnContext)) || {};

      Object.keys(conversationData).forEach((key) => delete conversationData[key]);

      console.log(`[MAIN] - RUN FUNCTION - HANDLE ${turnContext.activity.name} EVENT => end conv`);
      users.removeUser(turnContext.activity);
      return await helper.endConversation(dialogContext);
    }
  }

  async run(turnContext, accessor) {
    const dialogContext = await this.dialogSet.createContext(turnContext);

    const talkingWithAgent = await this.checkConnectAgentState(dialogContext);
    if (talkingWithAgent) {
      console.log(`[MAIN] - RUN FUNCTION - USER_IS_TALKING_WITH_AGENT => end conversation`);
      return await dialogContext.cancelAllDialogs();
    }

    if (turnContext.activity.channelId == 'WEB') {
      console.log(`[MAIN] - RUN FUNCTION - Send event ${CustomActivityTypes.ShowChatIcon}`);
      await turnContext.sendActivity({
        type: CustomActivityTypes.ShowChatIcon,
      });
    }

    const conversationData = await this.conversationDataAccessor.get(turnContext);

    if (!conversationData.user) {
      conversationData.user = users.add(turnContext.activity);
    }

    if (!conversationData.data) {
      conversationData.data = {};
    }

    //assign last message to user
    const user = users.findByActivity(turnContext.activity);
    if (user) {
      user.lastMsg = turnContext.activity.text || '';
      users.update(user);

      //clean conversation data if user disconnected with agent
      if (user.completed && conversationData) {
        Object.keys(conversationData).forEach((key) => delete conversationData[key]);
      }
    }

    // recover conversation
    const cached = turnContext.turnState.get(this.conversationState.stateKey);
    if (cached && cached.hash == '{}') {
      const result = await service.getContactMessageByUserID(turnContext.activity.conversation.id);

      const stack = tryParseJSON(result && result.DialogStack);
      const conversationData = tryParseJSON(result && result.ConversationData);

      if (result && Array.isArray(stack) && stack.length && result.ConversationData) {
        console.log(`[MAIN] - RUN FUNCTION - Recovery conv => found conv => load previous conv to memory`);
        await this.loadConversation(
          {
            state: {
              conversationData: conversationData,
              DialogState: { dialogStack: stack },
            },
          },
          turnContext
        );

        return await this.run(turnContext);
      }
    }

    await this.sendTypingIndicator(turnContext, true);

    const intentFlow = await this.checkRouting(turnContext);

    if (turnContext.activity.error || turnContext.activity.name == 'proactiveMessageTrigger' || intentFlow) {
      await dialogContext.cancelAllDialogs(true);
      return await dialogContext.beginDialog(this.id, { intentFlow });
    }

    const results = await dialogContext.continueDialog();

    if (results.status === DialogTurnStatus.empty) {
      console.log(`[MAIN] - RUN FUNCTION - Dialog stack empty or trigger proactive msg => start new conv`);
      return await dialogContext.beginDialog(this.id);
    }
  }

  async runErrorFlow(turnContext) {
    const dialogContext = await this.dialogSet.createContext(turnContext);

    const conversationData = await this.conversationDataAccessor.get(turnContext, {
      user: users.add(turnContext.activity),
      data: {},
    });

    await dialogContext.cancelAllDialogs(true);

    return await dialogContext.beginDialog(this.id, { error: true });
  }

  // return intent
  async checkRouting(context) {
    const conversationData = await this.conversationDataAccessor.get(context);

    const {
      data,
      translateService,
      companyId,
      callFlowId,
      sender,
      callId,
      from,
      recipient,
      allowLogInfo,
      flowData,
      interruptAction,
      env,
    } = conversationData || {};

    if (!interruptAction || !flowData || !Array.isArray(flowData.routingFlows) || !flowData.routingFlows.length)
      return false;

    const { LANGUAGE, DEFAULT_LANGUAGE } = data;

    const { routingFlows } = flowData || {};

    let result = {};

    for (let r of routingFlows) {
      const { Text, EntityAttribute, Attribute, GrammarArray, Name, Key, useMainRoutes } = r;

      let input = helper.replaceStrWithParam(data, Text) || '';

      if (!input) {
        if (!useMainRoutes) break;

        continue;
      }
      //check grammars
      try {
        result = await checkMultipleGrammars({
          GrammarArray: GrammarArray,
          input,
          translateService,
          companyId,
          callFlowId: r.flowId,
          sender,
          LANGUAGE,
          data: conversationData.data,
          DEFAULT_LANGUAGE,
        });

        if (result && result.intent) {
          result.Attribute = Attribute;
          result.EntityAttribute = EntityAttribute;

          result.Case = r.Cases.find((c) =>
            helper.checkCase({
              Case: c,
              ValueCheckNextCase: result.intent,
              ConversationData: data,
            })
          );

          if (!result.Case) {
            if (!useMainRoutes) break;

            continue;
          }

          await traceLog({
            from,
            sender,
            recipient,
            companyId,
            callId,
            callFlowId,
            data,
            name: Name,
            allowLogInfo,
            content: `Action: ${Name}|Grammar: ${result.passedGrammar}|User Input: ${input}|Intent: ${result.intent}`,
            logType: 'info',
            actionName: Name,
            actionKey: Key,
            currentFlowId: r.callFlowId,
          });

          result.flowId = r.flowId || callFlowId;

          break;
        } else {
          if (!useMainRoutes) break;
        }

        // if (result && Array.isArray(result.notMatches) && result.notMatches.length) {
        //   logRecognizeNoIntent({
        //     companyId,
        //     callFlowId,
        //     callId,
        //     text: input,
        //     responseList: result.notMatches.notMatches,
        //   });
        // }
      } catch (e) {
        console.log(`[MAIN] Check multiple grammar intent routing failed ${e.message} => go to error handler`);

        throw new CustomError(
          `[MAIN] Check multiple grammar intent routing failed ${e.message} => go to error handler`,
          e.ERROR_CODES,
          e.ERROR_MESSAGE || e.message
        );
      }
    }

    const { intent, entity, notMatches, Attribute, EntityAttribute } = result;

    if (intent && !helper.isFalse(Attribute)) {
      helper.assignValueToObject(conversationData.data, Attribute, intent);
    }

    if (entity && !helper.isFalse(EntityAttribute))
      helper.assignValueToObject(conversationData.data, EntityAttribute, entity);

    // handle flow data
    const i = flowData.flowInfo.findIndex((f) => f.flowId == result.flowId);

    if (i !== -1 && i !== 0) {
      helper.handleSubflowConversationData(conversationData, i);

      conversationData.flowData = new FlowData(flowData).handleRoutingIntent(i);
    }

    if (!result.Case) return false;

    return result.Case.Action;
  }

  async CheckReplaceFlow(step) {
    let { backToCardAction, attributeToCheck, valueCheckNextCase, nextAction } = step.context._activity;
    const { intentFlow, error } = step._info.options;

    let conversationData = await this.conversationDataAccessor.get(step.context);

    // run error flow handled from bot.js
    if (error) {
      console.log('[MAIN] Error occurred check error log for more details => Run error flow (Error Handler Action)');
      // send end typing if error handle
      await this.sendTypingIndicator(step, false);
      return await step.replaceDialog(REPLACE_DIALOG_ACTION);
    }

    if (intentFlow) {
      return await step.replaceDialog(REPLACE_DIALOG_ACTION, {
        NextAction: intentFlow,
      });
    }

    if (backToCardAction) {
      return await step.replaceDialog(REPLACE_DIALOG_ACTION, {
        ...nextAction,
        CheckForNextCase: true,
        AttributeToCheck: attributeToCheck,
        ValueCheckNextCase: valueCheckNextCase,
      });
    }

    return await step.next();
  }

  // get the chat flow step
  async ReadFlow(step) {
    let { extenData, recipient, from, channelId, attribute, callFlowId, companyId, customData, conversation } =
      step.context._activity;

    let conversationData = await this.conversationDataAccessor.get(step.context);

    let chatFlow;
    let mediaSetting;
    let langSetting;
    let callFlowName;

    // parse attributes from API
    attribute = typeof attribute === 'string' ? tryParseJSON(attribute) : attribute || {};

    console.log(`[MAIN] Received attributes from APIs: ${JSON.stringify(attribute)}`);

    // case test and proactive message
    if (extenData) {
      console.log('[MAIN] Using extendData to read the flow! Start parsing settings and flow');
      const settingFlow = tryParseJSON(extenData.callSettings);
      langSetting = tryParseJSON(settingFlow.languageSetting);
      let { error: errorMessage } = (settingFlow && settingFlow.prompts && tryParseJSON(settingFlow.prompts)) || {};

      const { attributes, env } = helper.mapDefaultValue(extenData.attribute);

      conversationData.companyId = parseInt(companyId) || extenData.companyId || settingFlow.companyId;
      conversationData.callId = conversation && conversation.id + '_' + moment().format('MMDDYYHH:mm:ss'); // unique id with timestamp for viewing logs on call flows
      conversationData.callFlowId = settingFlow.callFlowId;
      conversationData.data = attributes; // attributes to conversation data
      conversationData.env = env; // environment attributes
      conversationData.isProactive = extenData.isProactive || false; // proactive case
      conversationData.translateService = settingFlow.translateService; //call flow translate service
      conversationData.allowLogInfo = settingFlow.allowLogInfo; // allow log information to call flow
      conversationData.errorMessage = errorMessage;
      conversationData.serviceRequestTimeout = settingFlow.serviceRequestTimeout || 30;
      callFlowId = settingFlow.callFlowId;
      callFlowName = settingFlow.callFlowName;

      console.log(`[MAIN] Flow id : ${callFlowId}`);

      chatFlow = tryParseJSON(extenData.callFlowJson);
    } else {
      // case user chat in

      console.log(`[MAIN] Flow mode = ${process.env.FLOW_MODE}. Start getting flow!`);

      console.log(`[MAIN] Flow id : ${callFlowId}`);

      let filteredFlow;
      switch (process.env.FLOW_MODE) {
        case '2':
          filteredFlow = await service.getFlowWithId(callFlowId);

          if (!filteredFlow) {
            console.log(`[MAIN] Can not get flow with flow id ${callFlowId} ( API ) => try to get with phone number!`);
            // cant call API or cant not find flow => get from file
            filteredFlow = await service.getFlowWithPhoneNumber(recipient.id);
          }

          if (!filteredFlow) {
            console.log(`[MAIN] Can not get flow with phone number ${recipient.id} ( API ) => try from file!`);
            // get from file here
            filteredFlow = await fileService.readFlowFromFile(recipient.id);
          }
          break;
        case '3':
          // get from file
          console.log(`[MAIN] Get flow from file!`);
          filteredFlow = await fileService.readFlowFromFile(recipient.id);
          break;
        default:
          filteredFlow = await service.getFlowWithId(callFlowId);

          if (!filteredFlow) {
            console.log(`[MAIN] Can not get flow with flow id ( API ) => try to get with phone number!`);
            filteredFlow = await service.getFlowWithPhoneNumber(recipient.id);
          }
          break;
      }

      if (!filteredFlow) {
        // await step.context.sendActivity(
        //   process.env.ERROR_MESSAGE || 'Sorry there is something wrong! Please try again later!'
        // );

        console.log(`[MAIN] Can't filtered flow => end conversation`);

        users.removeUser(step.context.activity);
        conversationData.user = undefined;
        return await helper.endConversation(step);
      }

      // get defaults settings
      let callSetting = filteredFlow && filteredFlow.callSettings[0];
      langSetting = callSetting && tryParseJSON(callSetting.languageSetting);
      let { error: errorMessage } = (callSetting && callSetting.prompts && tryParseJSON(callSetting.prompts)) || {};

      // get defaults attributes from flow
      const { attributes, env } = helper.mapDefaultValue(filteredFlow.attribute);

      conversationData.companyId = filteredFlow && parseInt(filteredFlow.companyId);
      conversationData.callFlowId = (filteredFlow && filteredFlow.id) || callFlowId;
      conversationData.callId = conversation && conversation.id + '_' + moment().format('MMDDYYHH:mm:ss'); // unique id with timestamp for viewing logs on call flows
      conversationData.allowLogInfo = callSetting && callSetting.allowLogInfo; // allow log information to call flow
      conversationData.data = {
        ...conversationData.data,
        ...attributes,
      }; // attributes = conversation data
      conversationData.env = env; // environment attributes
      conversationData.translateService = callSetting && callSetting.translateService; //call flow translate service
      conversationData.errorMessage = errorMessage;
      conversationData.serviceRequestTimeout = (callSetting && callSetting.serviceRequestTimeout) || 30;

      if (typeof filteredFlow.jsonFormat === 'string') {
        chatFlow = tryParseJSON(filteredFlow.jsonFormat);
      } else {
        chatFlow = filteredFlow.jsonFormat;
      }

      if (typeof typeof callSetting.media === 'string') {
        mediaSetting = tryParseJSON(callSetting.media);
      } else {
        mediaSetting = callSetting.media;
      }

      mediaSetting = (Array.isArray(mediaSetting) && mediaSetting) || [];
      callFlowName = filteredFlow.name;
      callFlowId = filteredFlow.id;
    }

    const languageSettingDefault =
      (Array.isArray(langSetting) && langSetting.length && langSetting.find((languageUser) => languageUser.defaultUser)) ||
      {};

    const fromNumber = helper.getPhoneNumber(from.id).substr(-10) || helper.getUserID(from.id) || from.id || '';
    const toNumber = helper.getPhoneNumber(recipient.id).substr(-10) || helper.getUserID(recipient.id) || recipient.id || '';

    conversationData.data = {
      ...conversationData.data,
      ...attribute,
      CHANNEL_BOT: 'chatbot',
      USER_ID: helper.getPhoneNumber(conversation.id).substr(-10) || helper.getUserID(conversation.id),
      SESSION: {
        UNIQUE_ID: conversationData.callId || conversation.id || '',
        CALLER_NUMBER: fromNumber,
        DIAL_NUMBER: toNumber,
      },
      UNIQUE_ID: conversationData.callId || conversation.id || '',
      CALLER_NUMBER: fromNumber,
      DIAL_NUMBER: toNumber,
      CHANNEL_DATA: {
        ...(PROVIDERS.find((e) => e.id == channelId.toUpperCase()) || {
          id: channelId.toUpperCase(),
          name: 'Not supported',
        }),
        from: from.id,
        to: recipient.id,
      },
      DEFAULT_LANGUAGE: (languageSettingDefault.language && languageSettingDefault.language.split('-')[0]) || 'en',
      LANGUAGE:
        (attribute.AutoTranslateCallFlow == 'false' && 'en') || // EN IF AutoTranslateCallFlow = FALSE
        (attribute.LANGUAGE && attribute.LANGUAGE.split('-')[0]) || // HIGH PRIORITY FOR API
        (languageSettingDefault.language && languageSettingDefault.language.split('-')[0]) || // DEFAULT CALL SETTING LANG
        'en',
      CUSTOM_DATA: customData,
      CONVERSATION: step.context.activity.text
        ? [
            {
              sender: 'User',
              receiver: 'Bot',
              content: step.context.activity.text,
              datetime: moment().format('DD-MMM-YY dddd HH:mm:ss A'),
            },
          ]
        : [],
      CALL_FLOW_ID: conversationData.callFlowId,
      SENDER: fromNumber,
      RECEIVER: toNumber,
      ALLOW_LOG_INFO: conversationData.allowLogInfo,
      ERROR_CODE: '',
      ERROR_MESSAGE: '',
      CURRENT_ACTION_NAME: '',
      CURRENT_ACTION_KEY: '',
      CURRENT_CALL_FLOW_ID: conversationData.callFlowId,
      ERROR: null,
    };

    if (!(chatFlow.Action || chatFlow.NextAction)) {
      await step.context.sendActivity(
        process.env.ERROR_MESSAGE || 'Sorry there is something wrong! Please try again later!'
      );

      console.log(`[MAIN] Can't find any flow => end conversation`);

      users.removeUser(step.context.activity);
      conversationData.user = undefined;
      return await helper.endConversation(step);
    }

    const { IncommingCall } = chatFlow.Action || chatFlow.NextAction || {};

    //initialize

    conversationData.flowData = new FlowData({
      currentFlow: chatFlow,
      continueActions: [],
      previousFlows: [],
      flowsConversationData: [],
      outputSubFlowData: [],
      routingFlows: [IncommingCall && IncommingCall.IntentRoute].filter(Boolean),
      flowInfo: [
        {
          flowId: callFlowId || 'undefined flow id',
          flowName: callFlowName || 'undefined flow name',
        },
      ],
    });

    conversationData.firstHit = true;
    conversationData.runErrorFlow = false;
    conversationData.inErrorFlow = false;
    conversationData.sender = fromNumber;
    conversationData.recipient = toNumber;
    conversationData.conversationId = conversation.id;
    conversationData.channelId = channelId;
    conversationData.errorFlow = IncommingCall && IncommingCall.ErrorRoot;
    conversationData.customEvent = IncommingCall && IncommingCall.CustomEvent;
    conversationData.mediaSetting = mediaSetting;
    conversationData.repeatedPrompts = [];
    conversationData.defaultLanguage =
      (languageSettingDefault.language && languageSettingDefault.language.split('-')[0]) || 'en';
    conversationData.startTime = Date.now();

    conversationData.inComingHookFlow = IncommingCall && IncommingCall.InHookRoot;
    conversationData.outComingHookFlow = IncommingCall && IncommingCall.OutHookRoot;

    const user = users.findByActivity(step.context.activity);
    if (user) {
      user.lastMsg = step.context.activity.text || '';
      console.log(`Assign last msg: ${user.lastMsg}`);
      users.update(user);
    }

    if (step.context.activity.text && !('inHook' in conversationData)) {
      await this.hookBot.adapter.executeFlow(
        step.context.activity,
        async (hookContext) => await this.hookBot.run(hookContext, conversationData, true)
      );
    }

    if (conversationData.errorHappensInHook) {
      return await step.replaceDialog(REPLACE_DIALOG_ACTION, conversationData.errorFlow);
    }

    return await step.replaceDialog(REPLACE_DIALOG_ACTION, IncommingCall);
  }

  // add message history
  async addUserMsgToDB(context) {
    const { activity } = context;
    //save user message to db
    if (activity && activity.type == 'message') {
      let newActivity = {
        ...activity,
        extenData: '',
      };

      const conversationData = await this.conversationDataAccessor.get(context, {
        user: users.add(newActivity),
        data: {},
      });

      const user = users.add(activity);

      if (conversationData && conversationData.data) {
        user.name = conversationData.data.name || user.name || '';
        user.phone = conversationData.data.phone || user.phone || '';
        user.reason = conversationData.data.reason || user.reason || '';
        user.surveyCallFlowId = conversationData.data.SURVEY_FLOW_ID || user.surveyCallFlowId || null;
        users.update(user);
        conversationData.user = user;
      }

      const result = await service.addConversation(user, activity.text, false, false);
      if (!result || !result.ContactMessage) {
        console.log(`[addUserMsgToDB] Add user msg failed. Content: ${activity.text}`);
      }
    }
  }

  async addBotMsgToDB(activities, context, sendMsgResults) {
    for (let act of activities) {
      if (act.type == 'message') {
        const newActivity = {
          ...act,
          from: act.recipient,
          recipient: act.from,
        };
        let { text } = newActivity;
        if (!text && newActivity.attachments && newActivity.attachments.length) {
          text = newActivity.attachments[0].content.text;
        }

        const conversationData = await this.conversationDataAccessor.get(context);
        const user = users.add(newActivity);

        console.log(`addBotMsgToDB - users: ${JSON.stringify(users.getUsers())}`);
        console.log(`addBotMsgToDB - user: ${JSON.stringify(user)}`);

        if (conversationData && conversationData.data) {
          user.name = conversationData.data.name || user.name || '';
          user.phone = conversationData.data.phone || user.phone || '';
          user.reason = conversationData.data.reason || user.reason || '';
          user.surveyCallFlowId = conversationData.data.SURVEY_FLOW_ID || user.surveyCallFlowId || null;
          users.update(user);
          conversationData.user = user;
        }

        const result = await service.addConversation(
          user,
          text,
          true,
          false,
          (sendMsgResults && sendMsgResults.length && sendMsgResults[0].messageId) || null
        );
        if (!result || !result.ContactMessage) {
          console.log(`[addBotMsgToDB] Add user msg failed. Content: ${text}`);
        }
      }
    }
  }

  async updateConversationStateData(context) {
    const user = users.findByActivity(context.activity);
    const conversationData = await this.conversationDataAccessor.get(context, {
      user: users.add(context.activity),
      data: {},
    });

    console.log(`updateConversationStateData - user: ${JSON.stringify(user)}`);

    if (user && conversationData && conversationData.user) {
      conversationData.user = {
        ...conversationData.user,
        ...user,
      };
    }

    await this.conversationState.saveChanges(context, false);
  }

  async updateUserData(context) {
    const conversationData = await this.conversationDataAccessor.get(context);
    if (conversationData && conversationData.user) {
      users.update(conversationData.user);
    }
  }

  async checkAgentReplied(user, data) {
    const agentReply = await service.agentReplied(user);
    if (agentReply && agentReply.result) return true;
    //check active call
    const contactData = await service.getContact({
      PhoneNumber: (data && data.phone) || user.phone,
    });
    let activeCall = false;
    if (contactData && contactData.result) {
      let arr = JSON.parse(contactData.result);
      if (arr && arr.length > 0) {
        if (arr.length == 1) {
          const { Finished, LastExtension } = arr[0];
          activeCall = !!(!Finished && LastExtension);
        } else {
          //get real call
          const contact = arr.find((c) => c.ParentLSID == user.linkScopeID && c.UUI != 'LSFQ');
          if (contact) {
            const { Finished, LastExtension } = contact;
            activeCall = !!(!Finished && LastExtension);
          } else {
            console.log('[checkAgentReplied] Could not found active call by linkscopeID ' + user.linkScopeID);
          }
        }
      }
    }
    return activeCall;
  }

  async checkConnectAgentState(step) {
    const activity = step.context.activity;
    users.removeWaitingUser(activity.from.id);
    const conversationData = await this.conversationDataAccessor.get(step.context, {
      user: users.add(activity),
      data: {},
    });

    const { data: attributes } = conversationData;

    const user = users.findByActivity(activity);

    console.log(`checkConnectAgentState - user: ${JSON.stringify(user)}`);

    if (!user) return false;

    user.agentReplied = false;
    users.update(user);

    if (user.finalStep) {
      //check agent reply
      const agentReply = await this.checkAgentReplied(user, attributes);
      console.log(`[checkConnectAgentState] checkAgentReplied: ${JSON.stringify(agentReply)}`);
      if (agentReply) {
        user.agentReplied = true;
        users.update(user);
        console.log('[checkConnectAgentState] Agent replied and not completed => end conversation');

        await this.agentStateService.sendUserMsgToAgent(user, activity.text, this.adapter);

        return true;
      }
    }

    return false;
  }

  async sendTypingIndicator(turnContext, isTyping) {
    const { context } = turnContext;
    if (
      ['VIB', 'WHA', 'RIN', 'TWI', 'ZIP', 'QBL', '382', 'SMF'].includes(
        turnContext && turnContext.activity
          ? turnContext.activity.channelId
          : context && context.activity
          ? context.activity.channelId
          : ''
      )
    )
      return;

    const eventActivity = {
      type: isTyping ? CustomActivityTypes.Typing : CustomActivityTypes.StopTyping,
    };
    if (context) return await context.sendActivity(eventActivity);
    return await turnContext.sendActivity(eventActivity);
  }

  async handleReply(req, res) {
    try {
      console.log(`[handleReply] Reply api body: ${JSON.stringify(req.body)}`);
      const body = req.body;
      let user = users.find(body.ContactMessageUID) || users.findByConversationID(body.ContactMessageUID);

      //get address object from db
      if (!user && body.ContactMessageUID && body.AgentID) {
        var data = await service.getContactMessageByUserID(body.ContactMessageUID);
        if (data && data.AddressObj) {
          user = users.add(JSON.parse(data.AddressObj));
          users.copyInfoFromContactMessage(user, data);
          users.update(user);
        }
      }

      //handle agent reply
      if (user && user.activity) {
        console.log(`[handleReply] Found user activity to reply msg`);

        let json = body.AdditionalInfo;
        if (typeof body.AdditionalInfo == 'string') {
          try {
            json = JSON.parse(body.AdditionalInfo);
          } catch (e) {}
        }

        let result;

        if (json && json.messageType) {
          result = this.handleAdditionInfoReply(user.activity, body, json);
        } else {
          result = await this.sendProactiveMsg(user.activity, body.Content, true);
        }

        console.log(`[handleReply] replied successfully ${body.Content}`);
        return res.json({
          result: true,
          error: null,
          response: result,
        });
      }

      console.log(`[handleReply] replied failed ${req.body.Content}. Could not found activity to send msg`);
      return res.json({
        result: false,
        error: 'Could not found your contact message id',
      });
    } catch (err) {
      console.log(`[handleReply] reply message failed `, err);
      return res.json({
        result: false,
        error: `Reply message failed. Exception: ${err.stack}`,
      });
    }
  }

  async sendProactiveMsg(activity, message, notSaveMsgToDB = false) {
    const conversationReference = TurnContext.getConversationReference(activity);
    return await this.adapter.continueConversation(conversationReference, async (context) => {
      context.notSaveMsgToDB = notSaveMsgToDB;
      await context.sendActivity(message);
    });
  }

  async handleAdditionInfoReply(activity, body, additionalInfo) {
    let result;

    users.removeWaitingUser(activity.from.id);

    const user = users.findByActivity(activity);
    user.urgent = false;

    const agentName = (body && body.AgentName != 'AutoMessage' && body.AgentName) || user.agentName;

    switch (additionalInfo.messageType) {
      case 'connected':
        this.connectConv(user, body);
        result = await this.sendProactiveMsg(
          activity,
          helper.replaceStrWithParam({ agentName }, AGENT_CONNECT_MSG || body.Content),
          true
        );
        break;
      case 'completed':
        result = await this.sendProactiveMsg(
          activity,
          helper.replaceStrWithParam({ agentName }, AGENT_DISCONNECT_MSG || body.Content),
          true
        );
        this.runSurveyFlow(user);
        //insert msg to db
        this.completeConv(user);

        break;
      case 'disconnected':
        result = await this.sendProactiveMsg(
          activity,
          helper.replaceStrWithParam({ agentName }, AGENT_DISCONNECT_MSG || body.Content),
          true
        );
        this.runSurveyFlow(user);
        //no need handle in this
        this.disconnectConv(user);

        break;

      default:
        break;
    }

    this.sendConnectionEvent(agentName, activity, additionalInfo.messageType, true);

    return result;
  }

  async runSurveyFlow(user) {
    try {
      const { phone, surveyCallFlowId, linkScopeID, agentName, agentID } = user;

      console.log(
        `[runSurveyFlow] - survey attribute: phone: ${phone} - surveyCallFlowId: ${surveyCallFlowId} - agentName: ${agentName} - agentId: ${agentID}`
      );

      if (!surveyCallFlowId) {
        return console.log(`[runSurveyFlow] - survey call flow id is empty => not trigger survey flow`);
      }

      const arr = user.id.split('-');
      const userId = arr[0].substring(3);
      const botId = arr[1];

      const axios = require('axios').default;

      const requestBody = {
        method: 'POST',
        url: `${process.env.CALLFLOW_DOMAIN}/system/CallFlow/outreach/${surveyCallFlowId}`,
        data: {
          phoneNumber: userId,
          callerId: '',
          callerNumber: botId,
          attribute: JSON.stringify({
            LANGUAGE: 'en-US',
            ExtendData: {},
            phone,
            agentName,
            agentID,
          }),
          outreachType: 'sms',
          extendData: {},
          language: 'en-US',
        },
        headers: {
          Authorization: `Bearer ${process.env.CALLFLOW_LOGIN_TOKEN}`,
        },
      };
      const result = await axios(requestBody).catch((err) => (err.error && err.error.message) || err.message);

      console.log(
        `[runSurveyFlow] - Request: ${JSON.stringify(requestBody)} - Response: ${JSON.stringify(
          (result && result.data) || result
        )}`
      );
    } catch (ex) {
      console.log(`[runSurveyFlow] - Run failed - err: ${ex.message}`);
    }
  }

  async sendConnectionEvent(agentName, activity, type, notSaveMsgToDB = false) {
    if (!agentName) {
      console.log('Can not find agent name to send connection event!');
      return;
    }

    const conversationReference = TurnContext.getConversationReference(activity);
    return await this.adapter.continueConversation(conversationReference, async (context) => {
      context.notSaveMsgToDB = notSaveMsgToDB;
      if (type === 'connected') {
        await context.sendActivity({
          type: CustomActivityTypes.AgentConnect,
          channelData: {
            agentName: agentName,
            content: `${agentName} joined the chat.`,
          },
        });
      }
      if (type === 'disconnected' || type === 'completed') {
        await context.sendActivity({
          type: CustomActivityTypes.AgentDisconnect,
          channelData: {
            agentName: agentName,
            content: `${agentName} left the chat.`,
          },
        });
      }
    });
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  connectConv(user, body) {
    console.log('[connectConv] connected ' + user.id);
    user.agentName = body.AgentName;
    user.agentID = body.AgentID;
    user.finalStep = true;
    users.update(user);

    this.agentStateService.assignUserToAgentState(user, this.adapter);
  }

  completeConv(user) {
    console.log('[completeConv] completed ' + user.id);
    user.finalStep = false;
    user.fqInfo = null;
    user.prescreen = null;
    user.mainMenu = null;
    user.prescreenMenu = null;
    user.reason = '';
    user.acceptFQ = false;
    user.vdn = '';
    user.lastVDN = '';
    user.FQLinkScopeID = 0;
    user.notifyConnect = false;
    if (user.contactMessage) {
      user.contactMessage.AgentID = '';
    }
    user.agentID = null;
    user.agentName = null;
    user.lastConversationTime = new Date();
    user.agentEmail = null;
    user.agentConvId = null;
    user.completed = true;
    users.update(user);
  }

  disconnectConv(user) {
    console.log('[disconnectConv] disconnected ' + user.id);
    this.agentStateService.revokeUserFromAgentState(user, this.adapter);

    user.finalStep = false;
    user.agentID = null;
    user.agentName = null;
    user.lastConversationTime = new Date();
    user.agentEmail = null;
    user.agentConvId = null;
    user.lastMsg = null;
    user.completed = true;
    users.update(user);
  }

  listenEventFromRabbitMQ() {
    if (!process.env.ENABLE_MESSAGE_STATUS) return;
    let typingTimeOut;
    onReceivedMsg('FB@action', async (msg) => {
      const jsonData = helper.getJSONFromRabbitMQ(msg.content && msg.content.toString());
      if (jsonData) {
        console.log(`[listenEventFromRabbitMQ] rabbit mq msg: ${JSON.stringify(jsonData)}`);
        const { ContactMessageUID, Type, ValueType } = jsonData;
        const user = users.find(ContactMessageUID);
        if (!user) return;
        if (Type == 'typing') {
          clearTimeout(typingTimeOut);
          typingTimeOut = setTimeout(
            async () => {
              if (user.agentTyping != ValueType) {
                const conversationReference = TurnContext.getConversationReference(user.activity);
                await this.adapter.continueConversation(conversationReference, async (context) => {
                  await this.sendTypingIndicator({ context }, ValueType == 'true');
                });
                user.agentTyping = ValueType;
              }
            },
            ValueType ? 100 : 1000
          );
        }
      }
    });
  }

  handleUserTyping(activity) {
    if (process.env.ENABLE_MESSAGE_STATUS) {
      const data = [
        'ContactMessageUID',
        '$V$',
        activity.from.id,
        '$P$',
        'Type',
        '$V$',
        'typing',
        '$P$',
        'ValueType',
        '$V$',
        activity.text,
      ];
      amqpSendMsg('FB@customdata', data.join(''));
    }
  }

  async handleEvent(context) {
    const { activity } = context;
    switch (activity.name) {
      case 'cardButtonClicked':
        await this.handleCardButtonClicked(context);
        break;
      case 'endConversation':
      case 'user-endConversation':
        await this.handleEventEndConversation(context);
        break;
      case 'customData':
        context.activity.triggered = true;
        await this.handleEventCustomData(context);
        break;
      case 'typing':
        this.handleUserTyping(activity);
        break;
      case 'open-thread':
      case 'proactiveMessageTrigger':
        context.activity.triggered = true;
        await this.run(context, this.dialogState);
        break;
      default:
        break;
    }
  }

  async BindContactMessage(step) {
    const activity = step.context.activity;
    const conversationData = await this.conversationDataAccessor.get(step.context);
    conversationData.user = users.add(activity);

    const { data: attributes } = conversationData;
    const data = await service.getContactMessageByUserID(activity.from.id);
    if (data && data.MessageUID && attributes) {
      console.log(`[BindContactMessage] Found user in db - data: ${JSON.stringify(data.MessageUID)}`);
      conversationData.user.newUser = false;
      users.copyInfoFromContactMessage(conversationData.user, data, attributes);
      users.update(conversationData.user);
    }

    return await step.next();
  }

  async handleCardButtonClicked(context) {
    const { activity } = context;
    try {
      console.log(120);
      const conversationData = await this.conversationDataAccessor.get(context);
      const { flowData } = conversationData || {};

      const { value, flowId, actionId, output } = tryParseJSON(activity.data.value);

      conversationData.data[output] = value;

      let flowIndex = (flowData && flowData.flowInfo.findIndex((f) => f.flowId == flowId)) || 0;

      if (flowIndex >= 0 && flowData.previousFlows) {
        conversationData.flowData.continueActions.slice(0, flowIndex);
        conversationData.flowData.previousFlows.slice(0, flowIndex);
        conversationData.flowData.flowsConversationData.slice(0, flowIndex);
        conversationData.flowData.outputSubFlowData.slice(0, flowIndex);

        if (flowIndex > 0) {
          conversationData.flowData.flowInfo.slice(0, flowIndex);
        }

        const action = helper.findAction(flowData.previousFlows[flowIndex - 1] || flowData.currentFlow, actionId);

        if (action) {
          context.activity.nextAction = action.Cards;
          context.activity.backToCardAction = true;
          context.activity.attributeToCheck = output;
          if (!output) {
            context.activity.valueCheckNextCase = value;
          }
        }

        const dialogContext = await this.dialogSet.createContext(context);

        await dialogContext.cancelAllDialogs(true);

        return await dialogContext.beginDialog(this.id);
      }
    } catch (e) {
      console.error(`Handle event ${context.activity.name} error : ${e.message}`);
      console.error(e.stack);
    }
  }
}

module.exports = {
  MainDialog,
  CHAT,
};
