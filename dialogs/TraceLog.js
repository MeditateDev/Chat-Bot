const { ComponentDialog, WaterfallDialog } = require('botbuilder-dialogs');
const { traceLog } = require('../services/callflowLog');

const { TRACE_LOG_DIALOG, ERROR_CODES } = require('../constant');
const { replaceStrWithParam } = require('../util/helper');

const TRACE_LOG_WATERFALL = 'TRACE_LOG_WATERFALL';

class TraceLogDialog extends ComponentDialog {
  constructor(dialog) {
    super(TRACE_LOG_DIALOG);
    this.dialog = dialog;

    this.addDialog(new WaterfallDialog(TRACE_LOG_WATERFALL, [this.traceLog.bind(this)]));

    this.initialDialogId = TRACE_LOG_WATERFALL;
  }

  // send request
  async traceLog(step) {
    let { Name, Key, Content: content, Type } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);
    const {
      from,
      sender,
      recipient,
      companyId,
      callId,
      callFlowId,
      data,
      allowLogInfo,
      flowData,
      conversationId,
      serviceRequestTimeout,
    } = conversationData;
    const { flowId, flowName } = flowData.flowInfo[0];

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [TraceLog] ${Name} - Key: ${Key}`);

    const { result, error } = await traceLog({
      from,
      sender,
      recipient,
      companyId,
      callId,
      callFlowId,
      data,
      allowLogInfo,
      content: content ? replaceStrWithParam(data, content) : 'No Content',
      logType: Type,
      actionName: Name,
      actionKey: Key,
      currentFlowId: flowId,
      timeout: serviceRequestTimeout,
    });

    if (!result) {
      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.TRACE_LOG.TRACE_LOG_FAILED,
        ERROR_MESSAGE: `Call API trace log failed ${error.message}. StatusCode: ${error.response && error.response.status}`,
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog();
    }

    return await step.endDialog(step._info.options);
  }
}

module.exports = {
  TraceLogDialog,
};
