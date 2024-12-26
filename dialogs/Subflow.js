const { ComponentDialog, WaterfallDialog } = require('botbuilder-dialogs');
const { traceLog } = require('../services/callflowLog');

const { SUBFLOW_DIALOG, ERROR_CODES } = require('../constant');
const { tryParseJSON, mapDefaultValue, paramsExtract, InitDataSubFlow } = require('../util/helper');
const { getFlowWithId } = require('../services/service');

class SubflowDialog extends ComponentDialog {
  constructor(dialog) {
    super(SUBFLOW_DIALOG);
    this.dialog = dialog;

    this.addDialog(
      new WaterfallDialog('Subflow_Waterfall', [this.handleHookSubflow.bind(this), this.readSubFlow.bind(this)])
    );

    this.initialDialogId = 'Subflow_Waterfall';
  }

  async handleHookSubflow(step) {
    const { Name, Key, FlowName, NextAction, InputOption, OutputOption, CallFlowId } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    const {
      inHook,
      conversationId,
      data,
      env,
      flowData,
      serviceRequestTimeout,
      from,
      sender,
      recipient,
      companyId,
      callId,
      callFlowId,
      allowLogInfo,
    } = conversationData;

    const { flowId, flowName } = flowData.flowInfo[0];

    if (!inHook) return await step.next();

    if (!CallFlowId) {
      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.SUB_FLOW.SUB_FLOW_FIELD_EMPTY,
        ERROR_MESSAGE: `Flow id is empty`,
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog();
    }

    let subflow = await getFlowWithId(CallFlowId, serviceRequestTimeout);

    // storage old data & Input option => replace after out SubFlow
    conversationData.hookFlowData.flowsConversationData.unshift(data);
    conversationData.hookFlowData.outputSubFlowData.unshift(OutputOption);
    conversationData.hookFlowData.flowInfo.unshift({
      flowId: CallFlowId || '',
      flowName: FlowName || '',
    });
    conversationData.hookFlowData.previousFlows.unshift(conversationData.hookFlowData.currentFlow);
    const nextActionKey =
      (NextAction &&
        Object.keys(NextAction) &&
        Object.keys(NextAction)[0] &&
        NextAction[Object.keys(NextAction)[0]] &&
        NextAction[Object.keys(NextAction)[0]].Key) ||
      '';

    conversationData.hookFlowData.continueActions.unshift(nextActionKey);

    if (!subflow) {
      await traceLog({
        from,
        sender,
        recipient,
        companyId,
        callId,
        callFlowId,
        data,
        allowLogInfo,
        content: `Action: ${Name} | Error: Can not find the sub flow`,
        logType: 'error',
        actionName: Name,
        actionKey: Key,
        currentFlowId: flowId,
        timeout: serviceRequestTimeout,
      });

      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [SubFlow] Can not find the sub flow with flow id: ${CallFlowId} => endConversation`
      );

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.SUB_FLOW.SUB_FLOW_API_FAILED,
        ERROR_MESSAGE: `Can not find the sub flow with flow id: ${CallFlowId}`,
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog();
    }

    const { attributes } = mapDefaultValue(subflow.attribute);

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

    //replace current data with subflow default data and pass in Input
    conversationData.data = {
      ...InitDataSubFlow(data, attributes, paramsExtract(InputOption)),
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

    subflow = tryParseJSON(subflow.jsonFormat);

    const { IncommingCall } = subflow.Action || subflow.NextAction;

    return await step.endDialog(IncommingCall);
  }

  // get the chat flow step
  async readSubFlow(step) {
    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);
    const { FlowJson, Name, Key, FlowName, NextAction, InputOption, OutputOption, CallFlowId, IntentRoutingControl } =
      step._info.options;

    const {
      flowData,
      from,
      sender,
      recipient,
      companyId,
      callId,
      callFlowId,
      data,
      allowLogInfo,
      env,
      conversationId,
      serviceRequestTimeout,
    } = conversationData;

    const { flowId, flowName } = flowData.flowInfo[0];

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

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [SubFlow] ${Name} - Key : ${Key}`);

    if (!CallFlowId) {
      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.SUB_FLOW.SUB_FLOW_FIELD_EMPTY,
        ERROR_MESSAGE: `Flow id is empty`,
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog();
    }

    // storage old data & Input option => replace after out SubFlow
    conversationData.flowData.flowsConversationData.unshift(data);
    conversationData.flowData.outputSubFlowData.unshift(OutputOption);
    conversationData.flowData.flowInfo.unshift({
      flowId: CallFlowId || '',
      flowName: FlowName || '',
    });
    conversationData.flowData.previousFlows.unshift(conversationData.flowData.currentFlow);

    const nextActionKey =
      (NextAction &&
        Object.keys(NextAction) &&
        Object.keys(NextAction)[0] &&
        NextAction[Object.keys(NextAction)[0]] &&
        NextAction[Object.keys(NextAction)[0]].Key) ||
      '';

    conversationData.flowData.continueActions.unshift(nextActionKey);

    console.log(
      `[${conversationId} - ${flowId} - ${flowName}] [SubFlow] Continue with SubFlow - Id : ${CallFlowId} - Flow name: ${FlowName}`
    );

    let subflow = (await getFlowWithId(CallFlowId, serviceRequestTimeout)) || FlowJson;

    if (!subflow) {
      await traceLog({
        from,
        sender,
        recipient,
        companyId,
        callId,
        callFlowId,
        data,
        allowLogInfo,
        content: `Action: ${Name} | Error: Can not find the sub flow`,
        logType: 'error',
        actionName: Name,
        actionKey: Key,
        currentFlowId: flowId,
        timeout: serviceRequestTimeout,
      });

      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [SubFlow] Can not find the sub flow with flow id: ${CallFlowId} => endConversation`
      );

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.SUB_FLOW.SUB_FLOW_API_FAILED,
        ERROR_MESSAGE: `Can not find the sub flow with flow id: ${CallFlowId}`,
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog();
    }

    const { attributes } = mapDefaultValue(subflow.attribute);
    const subFlowName = subflow.name;

    //replace current data with subflow default data and pass in Input
    conversationData.data = {
      ...InitDataSubFlow(data, attributes, paramsExtract(InputOption)),
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

    subflow = tryParseJSON((subflow && subflow.jsonFormat) || subflow);

    const { IncommingCall } = subflow.Action || subflow.NextAction || subflow;

    conversationData.flowData.currentFlow = IncommingCall;
    const newRouting = (IncommingCall && IncommingCall.IntentRoute) || {};
    newRouting.useMainRoutes = IntentRoutingControl === 'include-main-flow';
    newRouting.flowId = CallFlowId;
    conversationData.flowData.routingFlows.unshift(newRouting);

    await traceLog({
      from,
      sender,
      recipient,
      companyId,
      callId,
      callFlowId,
      data,
      allowLogInfo,
      content: `Run flow: ${subFlowName}`,
      logType: 'debug',
      actionName: Name,
      actionKey: Key,
      currentFlowId: flowId,
      timeout: serviceRequestTimeout,
    });
    return await step.endDialog(IncommingCall);
  }
}

module.exports = {
  SubflowDialog,
};
