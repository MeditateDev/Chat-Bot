const { ComponentDialog, TextPrompt, WaterfallDialog, Dialog } = require('botbuilder-dialogs');
const { CustomConfirmPrompt } = require('../classes/CustomConfirmPrompt');
const { traceLog, logRecognizeNoIntent } = require('../services/callflowLog');

//import dialogs
const {
  replaceStrWithParam,
  assignValueToObject,
  isFalse,
  formatMessage,
  formatMultipleMessage,
  contentTraceLogMultipleMessages,
  formatEntitiesLog,
  getValueByPath,
} = require('../util/helper');

const { TEXT_PROMPT_DIALOG, ERROR_CODES } = require('../constant');
const { getPrompt, getRepeatedTimes, updateRepeatedTimes, getPromptMultipleMessage } = require('../util/prompts');
const translate = require('../services/translate');
const { checkMultipleGrammars } = require('../services/grammars');
const Buttons = require('../util/buttons');

const TEXT_PROMPT_WATERFALL = 'TEXT_PROMPT_WATERFALL';

const TEXT_PROMPT = 'TEXT_PROMPT';
const CONFIRM_PROMPT = 'CONFIRM_PROMPT';
const CONFIRM_INFORMATION_WATERFALL = 'CONFIRM_INFORMATION_WATERFALL';

class TextPromptDialog extends ComponentDialog {
  constructor(dialog) {
    super(TEXT_PROMPT_DIALOG);
    this.dialog = dialog;

    this.addDialog(new TextPrompt(TEXT_PROMPT));
    this.addDialog(new CustomConfirmPrompt(CONFIRM_PROMPT));
    this.addDialog(
      new WaterfallDialog(TEXT_PROMPT_WATERFALL, [
        this.handleRepeats.bind(this),
        this.handleNoInput.bind(this),
        this.handleNotMatch.bind(this),
        this.promptText.bind(this),
        this.promptMultipleMessage.bind(this),
        this.validateResponse.bind(this),
        this.checkUserResponse.bind(this),
      ])
    );

    this.addDialog(
      new WaterfallDialog(CONFIRM_INFORMATION_WATERFALL, [this.askForConfirm.bind(this), this.validateAnswer.bind(this)])
    );

    this.initialDialogId = TEXT_PROMPT_WATERFALL;
  }

  async handleRepeats(step) {
    const {
      Name,
      OtherCases,
      Repeat,
      Key,
      RememberRepeat,
      mainPromptRepeats,
      confirmNoRepeats,
      notMatchRetry,
      noInputRetry,
      confirmNoRetry,
      AttributeToSkip,
      SkipIfAttributeExists,
      Cases,
    } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    const { conversationId, flowData } = conversationData;

    const { flowId, flowName } = flowData.flowInfo[0];

    if (SkipIfAttributeExists === 'true' && AttributeToSkip && getValueByPath(conversationData.data, AttributeToSkip)) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [Prompt&Collect] Attribute existed - ${AttributeToSkip}: ${getValueByPath(
          conversationData.data,
          AttributeToSkip
        )} => skip & go to next action`
      );

      return await step.endDialog({
        ...step._info.options,
        CheckForNextCase: true,
        AttributeToCheck: AttributeToSkip,
      });
    }

    step._info.options.mainPromptRepeats = mainPromptRepeats || 0;

    //handle not match repeated times
    if (!notMatchRetry) {
      step._info.options.notMatchRepeats = +Repeat;
    }

    //handle no input repeated times
    if (!noInputRetry) {
      step._info.options.noInputRepeats = +Repeat;
    }

    //handle confirm no
    if (!confirmNoRetry) {
      step._info.options.confirmNoRepeats = +Repeat;
    } else {
      if (confirmNoRepeats <= 0) {
        console.log(
          `[${conversationId} - ${flowId} - ${flowName}] [Prompt&Collect] User confirm no reached max repeat count => go to not match case`
        );

        const OtherCase = OtherCases.find((otherCase) => otherCase.CaseOption === 'Not Match');

        conversationData.data = {
          ...conversationData.data,
          MAX_NOT_MATCH: !!!OtherCase,
        };

        return await step.endDialog(OtherCase);
      }

      if (isFalse(RememberRepeat)) {
        step._info.options.confirmNoRetry = false;
      }
    }

    if (isFalse(RememberRepeat)) return await step.next();
    // remember repeat enabled

    const { repeatedPrompts, callFlowId } = conversationData;

    if (notMatchRetry || noInputRetry || confirmNoRetry) {
      // repeated time must = return times + retries (-1 for exact retry prompt)
      // const actionReturnTimes = getRepeatedTimes(repeatedPrompts, callFlowId, Key);

      // step._info.options.mainPromptRepeats += actionReturnTimes > 0 ? actionReturnTimes - 1 : 0;

      //handle for confirm no
      step._info.options.confirmNoRetry = false;
    } else {
      // not retry case
      let repeated = getRepeatedTimes(repeatedPrompts, callFlowId, Key);
      if (+repeated >= step._info.options.Repeat) {
        console.log(
          `[${conversationId} - ${flowId} - ${flowName}] [Prompt&Collect] User repeated in this action times is greater or equal configured max tries => go to not match case`
        );

        const NotMatchCase = OtherCases.find((c) => c.CaseOption === 'Not Match');

        conversationData.data = {
          ...conversationData.data,
          MAX_NOT_MATCH: !!!NotMatchCase,
        };

        return await step.endDialog(NotMatchCase);
      }

      step._info.options.mainPromptRepeats = repeated;

      // update repeats
      conversationData.repeatedPrompts = updateRepeatedTimes(repeatedPrompts, callFlowId, Key);
    }

    return await step.next();
  }

  async handleNoInput(step) {
    const { Name, OtherCases, TextNoInput, Sentiment, Repeat, ContentNoInput } = step._info.options; //call flow vals
    const { noInputRetry, noInputRepeats, lastNoInputPrompt } = step._info.options;

    if (!noInputRetry) return await step.next();

    step._info.options.noInputRetry = false; //handled => remove noInputRetry

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    const { conversationId, flowData } = conversationData;

    const { flowId, flowName } = flowData.flowInfo[0];

    const { data, translateService, mediaSetting, channelId, defaultLanguage, serviceRequestTimeout } = conversationData;
    const { LANGUAGE } = data;

    if (noInputRepeats <= 0) {
      // send last no input messages before going to the next step
      if (lastNoInputPrompt && lastNoInputPrompt.length) {
        for (let msg of lastNoInputPrompt) {
          const rsp = await step.context.sendActivity(msg);

          if (!rsp.success) {
            conversationData.runErrorFlow = true;

            conversationData.data = {
              ...conversationData.data,
              ERROR_CODE: ERROR_CODES.SEND_FAILED,
              ERROR_MESSAGE: rsp.message,
              CURRENT_ACTION_NAME: Name,
            };

            return await step.endDialog();
          }
        }
      }

      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [Prompt&Collect] Reached max repeat count => go to no input case`
      );

      const NoInputCase = OtherCases.find((otherCase) => otherCase.CaseOption === 'No Input');

      conversationData.data = {
        ...conversationData.data,
        MAX_NOT_MATCH: !!!NoInputCase,
      };

      return await step.endDialog(NoInputCase);
    }

    step._info.options.lastNoInputPrompt = [];

    if (ContentNoInput) {
      let noInputMessages = getPromptMultipleMessage(
        ContentNoInput,
        '',
        LANGUAGE,
        defaultLanguage,
        +Repeat - noInputRepeats - 1
      );

      if (noInputMessages.length) {
        for (let msg of noInputMessages) {
          if (msg.type == 'text') {
            msg.value = replaceStrWithParam(data, msg.value);
            msg.value = await translate(msg.value, msg.language, LANGUAGE, translateService, serviceRequestTimeout);
          }

          let contentMessage = formatMultipleMessage({
            ...step._info.options,
            channelId,
            message: msg,
            mediaSetting,
            mediaName: Sentiment,
            lang: LANGUAGE,
            allowSpeak: true,
          });

          step._info.options.lastNoInputPrompt.push(contentMessage);

          const rsp = await step.context.sendActivity(contentMessage);

          if (!rsp.success) {
            conversationData.runErrorFlow = true;

            conversationData.data = {
              ...conversationData.data,
              ERROR_CODE: ERROR_CODES.SEND_FAILED,
              ERROR_MESSAGE: rsp.message,
              CURRENT_ACTION_NAME: Name,
            };

            return await step.endDialog();
          }
        }
      }
    } else {
      let noInputMsg = getPrompt(TextNoInput, '', LANGUAGE, defaultLanguage, +Repeat - noInputRepeats - 1);

      noInputMsg.text = replaceStrWithParam(data, noInputMsg.text);

      noInputMsg.text = await translate(
        noInputMsg.text,
        noInputMsg.language,
        LANGUAGE,
        translateService,
        serviceRequestTimeout
      );

      noInputMsg = formatMessage({
        channelId,
        message: noInputMsg.text,
        mediaSetting,
        mediaName: Sentiment,
        lang: LANGUAGE,
        allowSpeak: false,
      });

      step._info.options.lastNoInputPrompt.push(noInputMsg);

      const rsp = await step.context.sendActivity(noInputMsg);

      if (!rsp.success) {
        conversationData.runErrorFlow = true;

        conversationData.data = {
          ...conversationData.data,
          ERROR_CODE: ERROR_CODES.SEND_FAILED,
          ERROR_MESSAGE: rsp.message,
          CURRENT_ACTION_NAME: Name,
        };

        return await step.endDialog();
      }
    }

    return await step.next();
  }

  async handleNotMatch(step) {
    const { Name, OtherCases, TextNotMatch, Sentiment, Repeat, ContentNotMatch } = step._info.options; // Callflow vals
    const { notMatchRepeats, notMatchRetry, lastNotMatchPrompt } = step._info.options;

    if (!notMatchRetry) return await step.next();

    step._info.options.notMatchRetry = false;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    const { conversationId, flowData } = conversationData;

    const { flowId, flowName } = flowData.flowInfo[0];

    const { data, translateService, mediaSetting, channelId, defaultLanguage, serviceRequestTimeout } = conversationData;
    const { LANGUAGE } = data;

    if (notMatchRepeats <= 0) {
      if (lastNotMatchPrompt && lastNotMatchPrompt.length) {
        for (let msg of lastNotMatchPrompt) {
          const rsp = await step.context.sendActivity(msg);

          if (!rsp.success) {
            conversationData.runErrorFlow = true;

            conversationData.data = {
              ...conversationData.data,
              ERROR_CODE: ERROR_CODES.SEND_FAILED,
              ERROR_MESSAGE: rsp.message,
              CURRENT_ACTION_NAME: Name,
            };

            return await step.endDialog();
          }
        }
      }

      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [Prompt&Collect] Reached max repeat count => go to not match case`
      );

      const OtherCase = OtherCases.find((otherCase) => otherCase.CaseOption === 'Not Match');

      conversationData.data = {
        ...conversationData.data,
        MAX_NOT_MATCH: !!!OtherCase,
      };

      return await step.endDialog(OtherCase);
    }

    step._info.options.lastNotMatchPrompt = [];

    if (ContentNotMatch) {
      let notMatchMessages = getPromptMultipleMessage(
        ContentNotMatch,
        '',
        LANGUAGE,
        defaultLanguage,
        +Repeat - notMatchRepeats - 1
      );

      if (notMatchMessages.length) {
        for (let msg of notMatchMessages) {
          if (msg.type == 'text') {
            msg.value = replaceStrWithParam(data, msg.value);
            msg.value = await translate(msg.value, msg.language, LANGUAGE, translateService, serviceRequestTimeout);
          }

          let contentMessage = formatMultipleMessage({
            ...step._info.options,
            channelId,
            message: msg,
            mediaSetting,
            mediaName: Sentiment,
            lang: LANGUAGE,
            allowSpeak: true,
          });

          step._info.options.lastNotMatchPrompt.push(contentMessage);

          const rsp = await step.context.sendActivity(contentMessage);

          if (!rsp.success) {
            conversationData.runErrorFlow = true;

            conversationData.data = {
              ...conversationData.data,
              ERROR_CODE: ERROR_CODES.SEND_FAILED,
              ERROR_MESSAGE: rsp.message,
              CURRENT_ACTION_NAME: Name,
            };

            return await step.endDialog();
          }
        }
      }
    } else {
      let notMatch = getPrompt(TextNotMatch, '', LANGUAGE, defaultLanguage, +Repeat - notMatchRepeats - 1);

      notMatch.text = replaceStrWithParam(data, notMatch.text);

      notMatch.text = await translate(notMatch.text, notMatch.language, LANGUAGE, translateService, serviceRequestTimeout);

      notMatch = formatMessage({
        channelId,
        message: notMatch.text,
        mediaSetting,
        mediaName: Sentiment,
        lang: LANGUAGE,
        allowSpeak: false,
      });

      step._info.options.lastNotMatchPrompt.push(notMatch);

      const rsp = await step.context.sendActivity(notMatch);

      if (!rsp.success) {
        conversationData.runErrorFlow = true;

        conversationData.data = {
          ...conversationData.data,
          ERROR_CODE: ERROR_CODES.SEND_FAILED,
          ERROR_MESSAGE: rsp.message,
          CURRENT_ACTION_NAME: Name,
        };

        return await step.endDialog();
      }
    }

    return await step.next();
  }

  async promptText(step) {
    const {
      Answer,
      Text,
      TextChatBot,
      Name,
      Key,
      Sentiment,
      GrammarArray,
      AllowAnswerOption,
      ChatTimeout,
      mainPromptRepeats,
      AnswerOptionType,
      AnswerCustom,
    } = step._info.options;

    // send multiple messages
    if ('Content' in step._info.options) {
      return await step.next();
    }

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    const { data, translateService, mediaSetting, channelId, flowData, defaultLanguage, conversationId, firstHit } =
      conversationData;
    const { LANGUAGE } = data;
    const { flowId, flowName } = flowData.flowInfo[0];

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [Prompt&Collect] ${Name} - Key: ${Key}`);

    let msg = '';

    msg = getPrompt(TextChatBot, Text, LANGUAGE, defaultLanguage, mainPromptRepeats);

    msg.text = replaceStrWithParam(data, msg.text);

    if (!msg.text && step.context.activity.text && firstHit) {
      conversationData.firstHit = false;
      return await step.next(step.context.activity.text);
    }

    msg.text = await translate(msg.text, msg.language, LANGUAGE, translateService);

    msg = msg.text;

    msg = formatMessage({
      ...step._info.options,
      channelId,
      message: msg,
      mediaSetting,
      mediaName: Sentiment,
      lang: LANGUAGE,
      allowSpeak: true,
      AllowAnswerOption: true,
    });

    step._info.options.BotAskPrompt = msg;

    await step.prompt(TEXT_PROMPT, msg);

    let buttons = new Buttons({
      AllowAnswerOption,
      AnswerOptionType,
      GrammarArray,
      data,
      defaultLanguage,
      Answer,
      AnswerCustom,
      channelId,
      service: translateService,
    });
    let buttonsContent = await buttons.formatButtons();

    const { channelData } = buttonsContent || {};

    if (channelData && Array.isArray(channelData.buttons) && channelData.buttons.length) {
      const rsp = await step.context.sendActivity(buttonsContent);

      if (!rsp.success) {
        conversationData.runErrorFlow = true;

        conversationData.data = {
          ...conversationData.data,
          ERROR_CODE: ERROR_CODES.SEND_FAILED,
          ERROR_MESSAGE: rsp.message,
          CURRENT_ACTION_NAME: Name,
        };

        return await step.endDialog();
      }
    }

    step._info.options.mainPromptRepeats++;

    if (!isNaN(ChatTimeout) && +ChatTimeout > 0) {
      step._info.options.ResponseTimeOut = new Date();
    }

    return Dialog.EndOfTurn;
  }

  async promptMultipleMessage(step) {
    const {
      Answer,
      Name,
      Key,
      Sentiment,
      GrammarArray,
      AllowAnswerOption,
      ChatTimeout,
      mainPromptRepeats,
      AnswerOptionType,
      AnswerCustom,
      Content,
      ContentChatBot,
      InterruptAction,
    } = step._info.options;

    if (!('Content' in step._info.options)) return await step.next(step.result);

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    const {
      data,
      translateService,
      mediaSetting,
      channelId,
      flowData,
      defaultLanguage,
      conversationId,
      firstHit,
      serviceRequestTimeout,
    } = conversationData;
    const { LANGUAGE } = data;
    const { flowId, flowName } = flowData.flowInfo[0];

    conversationData.interruptAction = InterruptAction !== 'notAllow';

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [Prompt&Collect] ${Name} - Key: ${Key}`);

    let messages = getPromptMultipleMessage(ContentChatBot, Content, LANGUAGE, defaultLanguage, mainPromptRepeats);

    if ((!Array.isArray(messages) || !messages.length) && step.context.activity.text && firstHit) {
      conversationData.firstHit = false;
      return await step.next(step.context.activity.text);
    }

    const lastTextMessage = messages.filter((msg) => msg.type === 'text').pop() || {};
    const lastMessage = [...messages].pop();

    let buttons = new Buttons({
      AllowAnswerOption,
      AnswerOptionType,
      GrammarArray,
      data,
      defaultLanguage,
      Answer,
      AnswerCustom,
      channelId,
      service: translateService,
      timeout: serviceRequestTimeout,
    });
    let buttonsContent = await buttons.formatButtons();

    for (let msg of messages) {
      msg.value = replaceStrWithParam(data, msg.value);
      if (msg.type == 'text') {
        msg.value = await translate(msg.value, msg.language, LANGUAGE, translateService, serviceRequestTimeout);
      }

      let contentMessage = formatMultipleMessage({
        ...step._info.options,
        channelId,
        message: msg,
        mediaSetting,
        mediaName: Sentiment,
        lang: LANGUAGE,
        allowSpeak: true,
      });

      if (msg === lastTextMessage && GrammarArray && GrammarArray.includes('"name":"Date (mm-dd-yyyy)","type":"BuiltIn"')) {
        contentMessage.channelData = {
          type: 'built-in',
          name: 'date-time',
        };
      } else if (msg === lastMessage) {
        if (buttonsContent.channelData.buttons) contentMessage.channelData.buttons = [...buttonsContent.channelData.buttons];
      }

      const rsp = await step.context.sendActivity(contentMessage);

      if (!rsp.success) {
        conversationData.runErrorFlow = true;

        conversationData.data = {
          ...conversationData.data,
          ERROR_CODE: ERROR_CODES.SEND_FAILED,
          ERROR_MESSAGE: rsp.message,
          CURRENT_ACTION_NAME: Name,
        };

        return await step.endDialog();
      }
    }

    step._info.options.BotAskPrompt = messages;
    step._info.options.mainPromptRepeats++;

    if (!isNaN(ChatTimeout) && +ChatTimeout > 0) {
      step._info.options.ResponseTimeOut = new Date();
    }

    return Dialog.EndOfTurn;
  }

  async validateResponse(step) {
    const {
      Name,
      GrammarArray,
      Attribute,
      UserResponse,
      Repeat,
      TypeGrammar,
      Grammar,
      EntityAttribute,
      Log,
      BotAskPrompt,
      IdGrammar,
      ChatTimeout,
      Key,
    } = step._info.options; // Callflow vals

    const { notMatchRepeats, noInputRepeats } = step._info.options;

    const { value, title } = step.context.activity.data || {};

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    conversationData.interruptAction = true;

    conversationData.firstHit = false;

    const {
      companyId,
      callFlowId,
      sender,
      data,
      translateService,
      allowLogInfo,
      callId,
      recipient,
      from,
      conversationId,
      flowData,
      serviceRequestTimeout,
    } = conversationData;
    const { LANGUAGE, DEFAULT_LANGUAGE } = data;

    const { flowId, flowName } = flowData.flowInfo[0];

    const contentTraceLog = (BotAskPrompt && BotAskPrompt.Text) || contentTraceLogMultipleMessages(BotAskPrompt);

    if (!isNaN(ChatTimeout) && +ChatTimeout > 0 && this.checkTimeOut(step._info.options.ResponseTimeOut, +ChatTimeout)) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [Prompt&Collect] User response timeout => ask again`);

      await traceLog({
        from,
        sender,
        recipient,
        companyId,
        callId,
        callFlowId,
        data,
        allowLogInfo,
        content: `Action : ${Name} | Prompt: ${contentTraceLog} | User Response: ${
          value || step.result
        } | Intent: No intent`,
        logType: 'info',
        actionName: Name,
        actionKey: Key,
        currentFlowId: flowId,
        timeout: serviceRequestTimeout,
      });

      return await step.replaceDialog(TEXT_PROMPT_WATERFALL, {
        ...step._info.options,
        noInputRetry: true,
        noInputRepeats: noInputRepeats - 1,
      });
    }

    if (UserResponse) {
      conversationData.data = {
        ...conversationData.data,
        [UserResponse]: value || step.result,
      };
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [Prompt&Collect]  Saved user input "${
          value || step.result
        }" to "${UserResponse}"`
      );
    }

    if (Attribute) {
      conversationData.data = {
        ...conversationData.data,
        [Attribute]: value || step.result,
      };
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [Prompt&Collect]  Saved user input "${
          value || step.result
        }" to intent : "${Attribute}"`
      );
    }

    let result = {};

    try {
      result = await checkMultipleGrammars({
        GrammarArray,
        input: value || step.result,
        translateService,
        companyId,
        callFlowId,
        sender,
        defaults: [{ type: TypeGrammar, name: Grammar, id: IdGrammar }],
        LANGUAGE,
        data: conversationData.data,
        DEFAULT_LANGUAGE,
        timeout: serviceRequestTimeout,
      });
    } catch (e) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [Prompt&Collect] Check grammar error : ${e.message} => go to error handler`
      );

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: e.ERROR_CODE,
        ERROR_MESSAGE: e.ERROR_MESSAGE,
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog();
    }

    const { intent, entity, notMatches, passedGrammar } = result;

    // empty || false => ask again
    if (!intent) {
      if (Array.isArray(notMatches) && notMatches.length) {
        logRecognizeNoIntent({
          companyId,
          callFlowId,
          callId,
          text: value || step.result,
          responseList: notMatches,
        });
      }

      console.log(`[${conversationId} - ${flowId} - ${flowName}] [Prompt&Collect] Could not get user intent => ask again!`);
      // add log here
      await traceLog({
        from,
        sender,
        recipient,
        companyId,
        callId,
        callFlowId,
        data,
        allowLogInfo,
        content: `Action : ${Name} | Prompt: ${contentTraceLog} | User Response: ${
          value || step.result
        } | Intent: No intent`,
        logType: 'info',
        actionName: Name,
        actionKey: Key,
        currentFlowId: flowId,
        timeout: serviceRequestTimeout,
      });

      if (Attribute) {
        conversationData.data = {
          ...conversationData.data,
          [Attribute]: '',
        };
      }

      return await step.replaceDialog(TEXT_PROMPT_WATERFALL, {
        ...step._info.options,
        notMatchRetry: true,
        notMatchRepeats: notMatchRepeats - 1,
      });
    }

    //save intent
    assignValueToObject(conversationData.data, Attribute, intent);

    //save entity
    if (entity && !isFalse(EntityAttribute)) assignValueToObject(conversationData.data, EntityAttribute, entity);

    await traceLog({
      from,
      sender,
      recipient,
      companyId,
      callId,
      callFlowId,
      data: conversationData.data,
      allowLogInfo,
      content: `Action : ${Name} | Grammar: ${passedGrammar} | Prompt: ${contentTraceLog} | User Response: ${
        value || step.result
      } | Intent: ${intent} | Entity: ${formatEntitiesLog(entity)}`,
      logType: 'info',
      actionName: Name,
      actionKey: Key,
      currentFlowId: flowId,
      timeout: serviceRequestTimeout,
    });

    // check for confirm
    return await step.replaceDialog(CONFIRM_INFORMATION_WATERFALL, {
      ...step._info.options,
      result: step.result,
      RepeatConfirm: Repeat,
      ValueCheckNextCase: isFalse(Attribute) && intent,
    });
  }

  async checkUserResponse(step) {
    const { Repeat, Name, BotAskPrompt, Key } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);
    const { from, sender, recipient, companyId, callId, callFlowId, data, allowLogInfo, flowData, serviceRequestTimeout } =
      conversationData;

    const { flowId, flowName } = flowData.flowInfo[0];

    await traceLog({
      from,
      sender,
      recipient,
      companyId,
      callId,
      callFlowId,
      data,
      allowLogInfo,
      content: `Action : ${Name} | Prompt: ${
        (BotAskPrompt && BotAskPrompt.Text) || contentTraceLogMultipleMessages(BotAskPrompt)
      } | User Response: ${step.result} | Intent: None`,
      logType: 'info',
      actionName: Name,
      actionKey: Key,
      currentFlowId: flowId,
      timeout: serviceRequestTimeout,
    });

    return await step.replaceDialog(CONFIRM_INFORMATION_WATERFALL, {
      ...step._info.options,
      RepeatConfirm: Repeat,
    });
  }

  async askForConfirm(step) {
    const {
      Attribute,
      OtherCases,
      TextConfirm,
      Sentiment,
      RepeatConfirm,
      RetryConfirm,
      TextNotMatch,
      Repeat,
      IsConfirm,
      Name,
      BOT_CONFIRM_NOT_MATCH_PROMPT,
      ContentConfirm,
      Key,
    } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    const {
      data,
      from,
      sender,
      callId,
      channelId,
      recipient,
      companyId,
      callFlowId,
      allowLogInfo,
      mediaSetting,
      translateService,
      defaultLanguage,
      conversationId,
      flowData,
    } = conversationData;

    const { flowId, flowName } = flowData.flowInfo[0];

    const { LANGUAGE } = data;

    if (isFalse(IsConfirm)) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [Prompt&Collect] Confirm user input is not enabled => check for next step`
      );
      return await step.endDialog({
        ...step._info.options,
        CheckForNextCase: true,
        AttributeToCheck: Attribute,
      });
    }

    if (ContentConfirm) return await this.askForConfirmMultipleMessages(step);

    if (RetryConfirm && !isNaN(RepeatConfirm) && RepeatConfirm <= 0) {
      const rsp = await step.context.sendActivity(BOT_CONFIRM_NOT_MATCH_PROMPT);

      if (!rsp.success) {
        conversationData.runErrorFlow = true;

        conversationData.data = {
          ...conversationData.data,
          ERROR_CODE: ERROR_CODES.SEND_FAILED,
          ERROR_MESSAGE: rsp.message,
          CURRENT_ACTION_NAME: Name,
        };

        return await step.endDialog();
      }

      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [Prompt&Collect] Confirmation reached max repeat count => go to not match case`
      );

      const OtherCase = OtherCases.find((otherCase) => otherCase.CaseOption === 'Not Match');

      conversationData.data = {
        ...conversationData.data,
        MAX_NOT_MATCH: !!!OtherCase,
      };

      return await step.endDialog(OtherCase);
    }

    let repeated = (Repeat && !isNaN(RepeatConfirm) && Repeat - RepeatConfirm) || 0;

    let msg = getPrompt(TextConfirm, '', LANGUAGE, defaultLanguage, repeated);

    if (!msg.text) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [Prompt&Collect] Received empty message => skip confirmation go for next action`
      );
      return await step.endDialog({
        ...step._info.options,
        CheckForNextCase: true,
        AttributeToCheck: Attribute,
      });
    }

    let notmatch;

    if (RetryConfirm) {
      notmatch = getPrompt(TextNotMatch, '', LANGUAGE, defaultLanguage, repeated - 1);

      notmatch.text = await translate(notmatch.text, notmatch.language, LANGUAGE, translateService);

      notmatch = replaceStrWithParam(data, notmatch.text);

      notmatch = formatMessage({
        channelId,
        message: notmatch,
        mediaSetting,
        mediaName: Sentiment,
        lang: LANGUAGE,
        allowSpeak: false,
      });

      step._info.options.BOT_CONFIRM_NOT_MATCH_PROMPT = notmatch;

      const rsp = await step.context.sendActivity(notmatch);

      if (!rsp.success) {
        conversationData.runErrorFlow = true;

        conversationData.data = {
          ...conversationData.data,
          ERROR_CODE: ERROR_CODES.SEND_FAILED,
          ERROR_MESSAGE: rsp.message,
          CURRENT_ACTION_NAME: Name,
        };

        return await step.endDialog();
      }
    }

    msg.text = replaceStrWithParam(data, msg.text);

    msg.text = await translate(msg.text, msg.language, LANGUAGE, translateService);

    msg = formatMessage({
      channelId,
      message: msg.text,
      mediaSetting,
      mediaName: Sentiment,
      lang: LANGUAGE,
      allowSpeak: true,
      AllowAnswerOption: true,
    });

    if (msg.text) {
      await traceLog({
        from,
        sender,
        recipient,
        companyId,
        callId,
        callFlowId,
        data,
        allowLogInfo,
        content: `Action : ${Name} ask confirm | Prompt: ${msg.text}`,
        logType: 'info',
        actionName: Name,
        actionKey: Key,
        currentFlowId: flowId,
      });
    }

    const rsp = await step.context.sendActivity(msg);

    if (!rsp.success) {
      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.SEND_FAILED,
        ERROR_MESSAGE: rsp.message,
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog();
    }

    // Mock Button data yes-no
    const buttonDataYesNo = {
      AllowAnswerOption: true,
      data,
      defaultLanguage,
      service: translateService,
      Answer: [
        {
          name: 'yes',
          value: [{ name: 'English', language: 'en-US', value: 'Yes' }],
        },
        {
          name: 'no',
          value: [{ name: 'English', language: 'en-US', value: 'No' }],
        },
      ],
      channelId,
    };

    let buttons = new Buttons(buttonDataYesNo);

    let buttonsContent = await buttons.formatButtons();

    return await step.prompt(TEXT_PROMPT, buttonsContent);
  }

  async askForConfirmMultipleMessages(step) {
    const {
      Attribute,
      OtherCases,
      Sentiment,
      RepeatConfirm,
      RetryConfirm,
      Repeat,
      IsConfirm,
      Name,
      BOT_CONFIRM_NOT_MATCH_PROMPT,
      ContentConfirm,
      ContentNotMatch,
      confirmNoRepeats,
      Key,
    } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    const {
      data,
      from,
      sender,
      callId,
      channelId,
      recipient,
      companyId,
      callFlowId,
      allowLogInfo,
      mediaSetting,
      translateService,
      defaultLanguage,
      conversationId,
      flowData,
      serviceRequestTimeout,
    } = conversationData;

    const { flowId, flowName } = flowData.flowInfo[0];

    const { LANGUAGE } = data;

    if (isFalse(IsConfirm)) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [Prompt&Collect] Confirm user input is not enabled => check for next step`
      );
      return await step.endDialog({
        ...step._info.options,
        CheckForNextCase: true,
        AttributeToCheck: Attribute,
      });
    }

    if (RetryConfirm && !isNaN(RepeatConfirm) && RepeatConfirm <= 0) {
      const rsp = await step.context.sendActivity(BOT_CONFIRM_NOT_MATCH_PROMPT);

      if (!rsp.success) {
        conversationData.runErrorFlow = true;

        conversationData.data = {
          ...conversationData.data,
          ERROR_CODE: ERROR_CODES.SEND_FAILED,
          ERROR_MESSAGE: rsp.message,
          CURRENT_ACTION_NAME: Name,
        };

        return await step.endDialog();
      }

      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [Prompt&Collect] Confirmation reached max repeat count => go to not match case`
      );

      const OtherCase = OtherCases.find((otherCase) => otherCase.CaseOption === 'Not Match');

      conversationData.data = {
        ...conversationData.data,
        MAX_NOT_MATCH: !!!OtherCase,
      };

      return await step.endDialog(OtherCase);
    }

    let repeated = RetryConfirm
      ? Repeat && !isNaN(RepeatConfirm) && Repeat - RepeatConfirm
      : (Repeat && !isNaN(confirmNoRepeats) && Repeat - confirmNoRepeats) || 0;

    let messages = getPromptMultipleMessage(ContentConfirm, '', LANGUAGE, defaultLanguage, repeated);

    if (!messages.length) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [Prompt&Collect] Received empty message => skip confirmation go for next action`
      );
      return await step.endDialog({
        ...step._info.options,
        CheckForNextCase: true,
        AttributeToCheck: Attribute,
      });
    }

    let notMatchMessages = [];

    if (RetryConfirm) {
      notMatchMessages = getPromptMultipleMessage(ContentNotMatch, '', LANGUAGE, defaultLanguage, repeated);

      if (notMatchMessages.length) {
        for (let msg of notMatchMessages) {
          if (msg.type == 'text') {
            msg.value = replaceStrWithParam(data, msg.value);
            msg.value = await translate(msg.value, msg.language, LANGUAGE, translateService, serviceRequestTimeout);
          }

          let contentMessage = formatMultipleMessage({
            ...step._info.options,
            channelId,
            message: msg,
            mediaSetting,
            mediaName: Sentiment,
            lang: LANGUAGE,
            allowSpeak: true,
          });

          const rsp = await step.context.sendActivity(contentMessage);

          if (!rsp.success) {
            conversationData.runErrorFlow = true;

            conversationData.data = {
              ...conversationData.data,
              ERROR_CODE: ERROR_CODES.SEND_FAILED,
              ERROR_MESSAGE: rsp.message,
              CURRENT_ACTION_NAME: Name,
            };

            return await step.endDialog();
          }
        }
      }

      step._info.options.BOT_CONFIRM_NOT_MATCH_PROMPT = notMatchMessages;
    }

    // Mock Button data yes-no
    const buttonDataYesNo = {
      AllowAnswerOption: true,
      data,
      defaultLanguage,
      service: translateService,
      Answer: [
        {
          name: 'yes',
          value: [{ name: 'English', language: 'en-US', value: 'Yes' }],
        },
        {
          name: 'no',
          value: [{ name: 'English', language: 'en-US', value: 'No' }],
        },
      ],
      channelId,
      timeout: serviceRequestTimeout,
    };

    let buttons = new Buttons(buttonDataYesNo);

    let buttonsContent = await buttons.formatButtons();

    for (let msg of messages) {
      msg.value = replaceStrWithParam(data, msg.value);
      if (msg.type == 'text') {
        msg.value = await translate(msg.value, msg.language, LANGUAGE, translateService, serviceRequestTimeout);
      }

      let contentMessage = formatMultipleMessage({
        ...step._info.options,
        channelId,
        message: msg,
        mediaSetting,
        mediaName: Sentiment,
        lang: LANGUAGE,
        allowSpeak: true,
      });

      contentMessage.channelData.buttons = [...buttonsContent.channelData.buttons];
      contentMessage.text = msg.value;
      const rsp = await step.context.sendActivity(contentMessage);

      if (!rsp.success) {
        conversationData.runErrorFlow = true;

        conversationData.data = {
          ...conversationData.data,
          ERROR_CODE: ERROR_CODES.SEND_FAILED,
          ERROR_MESSAGE: rsp.message,
          CURRENT_ACTION_NAME: Name,
        };

        return await step.endDialog();
      }

      if (msg.text) {
        await traceLog({
          from,
          sender,
          recipient,
          companyId,
          callId,
          callFlowId,
          data,
          allowLogInfo,
          content: `Action : ${Name} ask confirm | Prompt: ${msg.value}`,
          logType: 'info',
          actionName: Name,
          actionKey: Key,
          currentFlowId: flowId,
        });
      }
    }

    return await step.prompt(TEXT_PROMPT, buttonsContent);
  }

  async validateAnswer(step) {
    const { Attribute, RepeatConfirm, confirmNoRepeats } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    const { data, translateService, conversationId, flowData, serviceRequestTimeout } = conversationData;

    const { flowId, flowName } = flowData.flowInfo[0];

    const { LANGUAGE } = data;

    let intent = await this.checkYesNo(step.result, LANGUAGE, translateService, serviceRequestTimeout);

    if (!intent) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [Prompt&Collect] Validate user confirmation failed - User input ${step.result}`
      );

      return await step.replaceDialog(CONFIRM_INFORMATION_WATERFALL, {
        ...step._info.options,
        RepeatConfirm: RepeatConfirm - 1,
        RetryConfirm: true,
      });
    }

    if (intent == 'no') {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [Prompt&Collect] Got user intent = no - User input ${step.result} => go back to main prompt to ask again `
      );

      return await step.replaceDialog(TEXT_PROMPT_WATERFALL, {
        ...step._info.options,
        confirmNoRetry: true,
        confirmNoRepeats: confirmNoRepeats - 1,
      });
    }

    console.log(
      `[${conversationId} - ${flowId} - ${flowName}] [Prompt&Collect] User confirmed information - User input ${step.result} => check for next case`
    );

    return await step.endDialog({
      ...step._info.options,
      CheckForNextCase: true,
      AttributeToCheck: Attribute,
    });
  }

  async checkYesNo(ur, language, service) {
    if (!ur) return ur;

    let text = ur;

    if (language && !language.startsWith('en')) {
      text = (await translate(ur, language, 'en', service)) || ur;
    }

    text = text.toLowerCase();

    if (/\b(?:yes|correct|ok|okay|yep|exactly|1|yeah|uh|right|true|sure|agree|confirm)\b/.test(text)) {
      return 'yes';
    }

    if (/\b(?:no|nope|not|2|none|false|disagree)\b/.test(text)) {
      return 'no';
    }

    return;
  }

  checkTimeOut(prev, secs) {
    const prevDate = new Date(prev);
    const newDate = new Date(prevDate.valueOf() + secs * 1000);

    return newDate < new Date();
  }
}

module.exports = {
  TextPromptDialog,
};
