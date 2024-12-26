const { ComponentDialog, DialogSet, WaterfallDialog } = require('botbuilder-dialogs');

const users = require('../services/user');
const service = require('../services/service');

const { REPLACE_DIALOG_ACTION } = require('../constant');
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
const { MultipleChoicesDialog } = require('./MultipleChoices');
const { DatasetDialog } = require('./Dataset');
const { ChatGPTDialog } = require('./ChatGPT');
const { TransferDialog } = require('./Transfer');
const { OutReachDialog } = require('./Outreach');
const { FormDialog } = require('./Form');
const { TranslateDialog } = require('./Translate');
const { IntentRecognitionDialog } = require('./IntentRecognition');
const { CheckTimezoneDialog } = require('./CheckTimezone');
const { WaitDialog } = require('./WaitAction');
const { SendMailDialog } = require('./SendMail');
const { CMSDialog } = require('./CMS');
const { LLMsDialog } = require('./LLMs');
const { CardsDialog } = require('./Cards');
const { HangUpDialog } = require('./HangUp');
const { BuiltInDialog } = require('./Builtin');
const { MultipleConditionDialog } = require('./MultipleCondition');

class HookBotDialog extends ComponentDialog {
  constructor(conversationState, adapter) {
    super('HOOK_DIALOG');

    this.adapter = adapter;
    this.conversationState = conversationState;
    this.conversationDataAccessor = this.conversationState.createProperty('conversationData');
    this.dialogState = conversationState.createProperty('DialogState');
    this.dialogSet = new DialogSet(this.dialogState);
    // this.dialogSet = new DialogSet(this.conversationDataAccessor);
    this.dialogSet.add(this);

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
      new WaterfallDialog('BOT_HOOK_WATERFALL', [
        async (step) => {
          let conversationData = await this.conversationDataAccessor.get(step.context);

          if (conversationData.data && step.context.activity.text) {
            conversationData.data.USER_INPUT = step.context.activity.text;
          }

          const flow = step._info.options.isUser ? conversationData.inComingHookFlow : conversationData.outComingHookFlow;

          if (!flow || conversationData.doNotRunHook) return step.endDialog();

          conversationData.hookFlowData = {
            currentFlow: flow,
            continueActions: [],
            previousFlows: [],
            flowsConversationData: [],
            outputSubFlowData: [],
            flowInfo: [
              {
                flowId: (conversationData.flowData && conversationData.flowData.flowInfo[0].flowId) || 'undefined flow id',
                flowName:
                  (conversationData.flowData && conversationData.flowData.flowInfo[0].flowName) || 'undefined flow name',
              },
            ],
          };

          conversationData.inHook = true;

          return await step.replaceDialog(REPLACE_DIALOG_ACTION, flow);
        },
      ])
    );

    this.initialDialogId = 'BOT_HOOK_WATERFALL';
  }

  async run(turnContext, data, isUser) {
    const dialogContext = await this.dialogSet.createContext(turnContext);

    const talkingWithAgent = await this.checkConnectAgentState(dialogContext);
    if (talkingWithAgent) {
      return await dialogContext.cancelAllDialogs();
    }

    await this.conversationDataAccessor.set(turnContext, data);

    await dialogContext.cancelAllDialogs();

    return await dialogContext.beginDialog(this.id, { isUser });
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

    const { user, data: attributes } = conversationData;

    if (!user) return false;

    user.agentReplied = false;
    users.update(conversationData.user);

    if (user.finalStep) {
      //check agent reply
      const agentReply = await this.checkAgentReplied(conversationData.user, attributes);
      if (agentReply) {
        user.agentReplied = true;
        users.update(conversationData.user);

        return true;
      }
    }
    return false;
  }
}

module.exports = {
  HookBotDialog,
};
