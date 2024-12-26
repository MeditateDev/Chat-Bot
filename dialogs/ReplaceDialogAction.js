const { ComponentDialog, WaterfallDialog } = require('botbuilder-dialogs');
const { traceLog } = require('../services/callflowLog');
const users = require('../services/user');
const { CustomError } = require('../classes/CustomError');

const { REPLACE_DIALOG_ACTION, ERROR_CODES, ACTION, INVALID_ACTIONS_IN_HOOK } = require('../constant');
const { checkCase, assignSubflowOutput, endConversation, formatErrorLogStr, findAction } = require('../util/helper');

const REPLACE_WATERFALL = 'REPLACE_WATERFALL';

class ReplaceDialogAction extends ComponentDialog {
  constructor(dialog) {
    super(REPLACE_DIALOG_ACTION);
    this.dialog = dialog;

    this.addDialog(
      new WaterfallDialog(REPLACE_WATERFALL, [
        this.mapData.bind(this),
        this.checkCustomEvent.bind(this),
        this.checkNextCase.bind(this),
        this.checkHookSubFlow.bind(this),
        this.checkSubFlow.bind(this),
        this.checkError.bind(this),
        this.replaceDialog.bind(this),
        this.loopDialog.bind(this),
      ])
    );

    this.initialDialogId = REPLACE_WATERFALL;
  }

  // use NextAction only
  async mapData(step) {
    const { NextAction, Action } = step._info.options;
    step._info.options.NextAction = NextAction || Action;
    delete step._info.options.Action;

    return await step.next();
  }

  async checkCustomEvent(step) {
    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);
    const { customEvent, data, conversationId, flowData, inErrorFlow, startTime, inHook } = conversationData;
    const { flowId, flowName } = flowData.flowInfo[0];

    //update duration
    conversationData.data.DURATION = Math.floor((Date.now() - startTime) / 1000);

    if (!Array.isArray(customEvent) || (customEvent && customEvent.length == 0) || inHook) return await step.next();

    for (let event of customEvent) {
      const { Attribute, Cases, Name } = event;

      if (!Attribute && !inErrorFlow) {
        conversationData.runErrorFlow = true;

        conversationData.data = {
          ...conversationData.data,
          ERROR_CODE: ERROR_CODES.CUSTOM_EVENT.EVENT_VARIABLE_FIELD_EMPTY,
          ERROR_MESSAGE: `Variable field is empty`,
          CURRENT_ACTION_NAME: Name,
        };

        // Block next action check
        step._info.options.NextAction = undefined;

        console.log(
          `[${conversationId} - ${flowId} - ${flowName}] [ReplaceDialog] Custom event variable field is empty => go to error handler`
        );
        return await step.next();
      }

      if (!Array.isArray(Cases)) continue;

      for (let Case of Cases) {
        const rightCase = checkCase({
          Case,
          Attribute,
          ConversationData: data,
        });

        if (rightCase) {
          console.log(
            `[${conversationId} - ${flowId} - ${flowName}] [ReplaceDialog] Custom event triggered - Check ${Attribute}=${JSON.stringify(
              rightCase.BOT_DATA_CHECK
            )} - Passed case ${rightCase.BOT_COMPARE} ${rightCase.BOT_ATTRIBUTE_CHECK}`
          );
          conversationData.customEvent = customEvent.filter((ev) => ev.Key !== event.Key);
          step._info.options.NextAction = rightCase.Action || rightCase.NextAction;
          return await step.next({ customEventTriggered: true });
        }
      }
    }

    return await step.next();
  }

  async checkNextCase(step) {
    let { CheckForNextCase, AttributeToCheck, ValueCheckNextCase } = step._info.options;

    if (
      (step.result && step.result.customEventTriggered) ||
      !CheckForNextCase ||
      !(AttributeToCheck || ValueCheckNextCase)
    ) {
      return await step.next();
    }

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    step._info.options.NextAction = this.getNextCase(
      step._info.options,
      AttributeToCheck,
      conversationData.data,
      ValueCheckNextCase
    );

    return await step.next();
  }

  async checkHookSubFlow(step) {
    const { NextAction } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    const { inHook, hookFlowData, runErrorFlow, data, env, conversationId } = conversationData;

    if (NextAction || NextAction || runErrorFlow || !inHook || !hookFlowData || !hookFlowData.continueActions.length) {
      return await step.next();
    }

    const {
      CUSTOM_DATA,
      CHANNEL_DATA,
      LANGUAGE,
      SESSION,
      USER_ID,
      CHANNEL_BOT,
      DIAL_NUMBER,
      CALLER_NUMBER,
      UNIQUE_ID,
      CONVERSATION,
      CALL_FLOW_ID,
      SENDER,
      RECEIVER,
      DURATION,
      ALLOW_LOG_INFO,
      ERROR_CODE,
      ERROR_MESSAGE,
      CURRENT_ACTION_NAME,
      CURRENT_ACTION_KEY,
      CURRENT_CALL_FLOW_ID,
      ERROR,
    } = data;

    const previousFlows = hookFlowData.flowInfo;

    for (let flow of previousFlows) {
      conversationData.hookFlowData.currentFlow = hookFlowData.previousFlows[0];

      conversationData.hookFlowData.previousFlows.shift(0);
      conversationData.data = {
        ...assignSubflowOutput(
          conversationData.hookFlowData.outputSubFlowData[0],
          conversationData.data,
          conversationData.hookFlowData.flowsConversationData[0]
        ),
        CUSTOM_DATA,
        CHANNEL_DATA,
        LANGUAGE,
        SESSION,
        USER_ID,
        CHANNEL_BOT,
        DIAL_NUMBER,
        CALLER_NUMBER,
        UNIQUE_ID,
        CONVERSATION,
        CALL_FLOW_ID,
        SENDER,
        RECEIVER,
        DURATION,
        ALLOW_LOG_INFO,
        ERROR_CODE,
        ERROR_MESSAGE,
        CURRENT_ACTION_NAME,
        CURRENT_ACTION_KEY,
        CURRENT_CALL_FLOW_ID,
        ERROR,
        ...env,
      };
      conversationData.hookFlowData.flowsConversationData.shift(0);
      conversationData.hookFlowData.outputSubFlowData.shift(0);
      conversationData.hookFlowData.flowInfo.shift(0);
      console.log(
        `[${conversationId}] [ReplaceDialog] Out of HookSubFlow continue previous flow - Id : ${conversationData.hookFlowData.flowInfo[0].flowId}`
      );

      if (hookFlowData.continueActions[0]) {
        step._info.options.NextAction = findAction(
          conversationData.hookFlowData.currentFlow,
          hookFlowData.continueActions[0]
        );
        conversationData.hookFlowData.continueActions.shift(0);
        return await step.next();
      }
      conversationData.hookFlowData.continueActions.shift(0);
    }

    return await step.next();
  }

  async checkSubFlow(step) {
    const { NextAction } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    let { flowData, data, env, conversationId, runErrorFlow, inHook, inErrorFlow } = conversationData;

    if (NextAction || runErrorFlow || !flowData || !flowData.continueActions.length || inHook || inErrorFlow)
      return await step.next();

    const {
      CUSTOM_DATA,
      CHANNEL_DATA,
      LANGUAGE,
      SESSION,
      USER_ID,
      CHANNEL_BOT,
      DIAL_NUMBER,
      CALLER_NUMBER,
      UNIQUE_ID,
      CONVERSATION,
      CALL_FLOW_ID,
      SENDER,
      RECEIVER,
      DURATION,
      ALLOW_LOG_INFO,
      ERROR_CODE,
      ERROR_MESSAGE,
      CURRENT_ACTION_NAME,
      CURRENT_ACTION_KEY,
      CURRENT_CALL_FLOW_ID,
      ERROR,
    } = data;

    const previousFlows = flowData.flowInfo;

    for (let flow of previousFlows) {
      conversationData.flowData.currentFlow = flowData.previousFlows[0];

      conversationData.flowData.previousFlows.shift(0);
      conversationData.flowData.routingFlows.shift(0);
      conversationData.data = {
        ...assignSubflowOutput(
          conversationData.flowData.outputSubFlowData[0],
          conversationData.data,
          conversationData.flowData.flowsConversationData[0]
        ),
        CUSTOM_DATA,
        CHANNEL_DATA,
        LANGUAGE,
        SESSION,
        USER_ID,
        CHANNEL_BOT,
        DIAL_NUMBER,
        CALLER_NUMBER,
        UNIQUE_ID,
        CONVERSATION,
        CALL_FLOW_ID,
        SENDER,
        RECEIVER,
        DURATION,
        ALLOW_LOG_INFO,
        ERROR_CODE,
        ERROR_MESSAGE,
        CURRENT_ACTION_NAME,
        CURRENT_ACTION_KEY,
        CURRENT_CALL_FLOW_ID,
        ERROR,
        ...env,
      };
      conversationData.flowData.flowsConversationData.shift(0);
      conversationData.flowData.outputSubFlowData.shift(0);
      conversationData.flowData.flowInfo.shift(0);
      console.log(
        `[${conversationId}] [ReplaceDialog] Out of SubFlow continue previous flow - Id : ${conversationData.flowData.flowInfo[0].flowId}`
      );

      if (flowData.continueActions[0]) {
        step._info.options.NextAction = findAction(conversationData.flowData.currentFlow, flowData.continueActions[0]);
        conversationData.flowData.continueActions.shift(0);
        return await step.next();
      }
      conversationData.flowData.continueActions.shift(0);
    }

    return await step.next();
  }

  async checkError(step) {
    let { NextAction } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    const { runErrorFlow, errorHappensInHook, serviceRequestTimeout } = conversationData;

    if ((!runErrorFlow || NextAction) && !errorHappensInHook) return await step.next();

    let { data, from, sender, recipient, companyId, callId, callFlowId, allowLogInfo } = conversationData;

    await traceLog({
      from,
      sender,
      recipient,
      companyId,
      callId,
      callFlowId,
      data,
      content: formatErrorLogStr(data.CURRENT_ACTION_NAME, data.ERROR_CODE, data.ERROR_MESSAGE),
      allowLogInfo,
      logType: 'error',
      actionName: data.CURRENT_ACTION_NAME,
      actionKey: data.CURRENT_ACTION_KEY,
      currentFlowId: data.CURRENT_CALL_FLOW_ID,
      timeout: serviceRequestTimeout,
    });

    conversationData.runErrorFlow = false;
    conversationData.errorHappensInHook = false;

    //avoid error loop
    if (conversationData.inErrorFlow) {
      await step.context.sendActivity(conversationData.errorMessage || process.env.ERROR_MESSAGE);
      return await endConversation(step);
    }

    conversationData.inErrorFlow = true;

    step._info.options.NextAction = conversationData.errorFlow && conversationData.errorFlow.NextAction;

    return await step.next();
  }

  async replaceDialog(step) {
    let { NextAction } = step._info.options;
    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    let {
      data,
      from,
      sender,
      recipient,
      companyId,
      callId,
      callFlowId,
      allowLogInfo,
      conversationId,
      flowData,
      serviceRequestTimeout,
    } = conversationData;

    const { flowId, flowName } = flowData.flowInfo[0];

    if (NextAction && typeof NextAction == 'object') {
      console.log('---------------------------------------------------------------------------------');

      const key = Object.keys(NextAction)[0];
      const { Name, Key } = Object.values(NextAction)[0];
      if (conversationData.inHook && !INVALID_ACTIONS_IN_HOOK.includes(key)) {
        conversationData.runErrorFlow = true;
        conversationData.errorHappensInHook = true;
        conversationData.doNotRunHook = true;

        conversationData.data.ERROR_CODE = ERROR_CODES.INVALID_ACTION;
        conversationData.data.ERROR_MESSAGE =
          'The system error is caused by your flow looping in Hook by the invalid action.';
        conversationData.data.CURRENT_ACTION_NAME = Name;

        // in hook => this will end the hook and bot will run error handler
        conversationData.inHook = false;
        return await endConversation(step, '', true);
      }

      conversationData.data.CURRENT_ACTION_NAME = Name;
      conversationData.data.CURRENT_ACTION_KEY = Key;
      conversationData.data.CURRENT_CALL_FLOW_ID = flowId;

      if (key !== 'ChatGPT' && key !== 'GetInput' && key !== 'RedirectCallflow') conversationData.firstHit = false;

      if (key !== 'SubAction') {
        await traceLog({
          from,
          sender,
          recipient,
          companyId,
          callId,
          callFlowId,
          data,
          content: `Go to action: ${Name}`,
          allowLogInfo,
          logType: 'debug',
          actionName: Name,
          actionKey: Key,
          currentFlowId: flowId,
          timeout: serviceRequestTimeout,
        });
      }

      //replace for end flow
      if (['Transfer', 'HangupAction'].includes(key)) {
        return await step.replaceDialog(ACTION[key], NextAction[key]);
      }

      // go to next action
      if (ACTION[key]) {
        //remove error because other case available
        conversationData.runErrorFlow = false;
        return await step.beginDialog(ACTION[key], NextAction[key]);
      }
    }

    if (step.context.activity.channelId === 'VDB') {
      await step.context.sendActivity({
        type: 'endOfConversation',
      });
    }

    const inHook = conversationData.inHook;

    if (inHook) {
      conversationData.inHook = false;
    } else {
      console.log(`[${conversationId}] [ReplaceDialog] Can not find any next action => end conversation`);
      users.removeUser(step.context.activity);

      Object.keys(conversationData).forEach((key) => delete conversationData[key]);
    }

    return await endConversation(step, '', inHook);
  }

  async loopDialog(step) {
    return await step.replaceDialog(REPLACE_WATERFALL, step.result);
  }

  getNextCase(options, Attribute, conversationData, ValueCheckNextCase) {
    const { Cases, OtherCases } = options;

    for (let Case of Cases) {
      if (Case.CaseOption === 'Success') {
        console.log(`[ReplaceDialog] Success case existed => go to success case`);
        return Case.Action || Case.NextAction;
      }

      const foundCase = checkCase({
        Case: Case,
        Attribute,
        ConversationData: conversationData,
        ValueCheckNextCase,
      });

      if (foundCase) {
        console.log(
          `[ReplaceDialog] Check ${Attribute || 'Not assigned value'}=${JSON.stringify(
            foundCase.BOT_DATA_CHECK
          )} - Passed case ${foundCase.BOT_COMPARE} ${foundCase.BOT_ATTRIBUTE_CHECK}`
        );

        return foundCase.Action || foundCase.NextAction;
      }
    }

    if (Attribute) {
      console.log(
        `[ReplaceDialog] ${Attribute}=${JSON.stringify(
          conversationData[Attribute]
        )} - Not passed any case => go to other case`
      );
    }

    if (Array.isArray(OtherCases)) {
      const Case = OtherCases.find((c) => c.CaseOption == 'Other');

      return Case && (Case.Action || Case.NextAction);
    }

    return OtherCases && (OtherCases.Action || OtherCases.NextAction);
  }
}

module.exports = {
  ReplaceDialogAction,
};
