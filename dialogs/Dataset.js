const { ComponentDialog, WaterfallDialog } = require('botbuilder-dialogs');
const axios = require('axios');
const { DATASET_DIALOG, CALL_FLOW_HEADERS, ERROR_CODES } = require('../constant');
const { traceLog } = require('../services/callflowLog');
const { replaceStrWithParam } = require('../util/helper');
const { callDataSet } = require('../services/service');

const DATASET_WATERFALL = 'DATASET_WATERFALL';

class DatasetDialog extends ComponentDialog {
  constructor(dialog) {
    super(DATASET_DIALOG);
    this.dialog = dialog;

    this.addDialog(new WaterfallDialog(DATASET_WATERFALL, [this.dataSet.bind(this)]));

    this.initialDialogId = DATASET_WATERFALL;
  }
  async dataSet(step) {
    const { DatasetId, DatasetName, Labels, Name, Key, Note } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);
    const {
      from,
      callId,
      callFlowId,
      data,
      sender,
      recipient,
      flowData,
      companyId,
      allowLogInfo,
      conversationId,
      serviceRequestTimeout,
    } = conversationData;

    const { flowId, flowName } = flowData.flowInfo[0];

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [Dataset] ${Name} - Key : ${Key}`);

    if (!DatasetId) {
      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.REPORT.REPORT_FIELD_EMPTY,
        ERROR_MESSAGE: `Report id is empty`,
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog();
    }

    try {
      const data = {
        CallID: callId,
        CallFlowId: callFlowId,
        DatasetId: DatasetId,
        Label: Labels,
        FromNumber: sender,
        ToNumber: recipient,
        Note: replaceStrWithParam(conversationData.data, Note),
      };
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
        content: `Action: ${Name} | Data:`,
        jsonRefData:data,
        logType: 'info',
        actionName: Name,
        actionKey: Key,
        currentFlowId: flowId,
        timeout: serviceRequestTimeout,
      });
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [Dataset] ${JSON.stringify(data)}`);
      const resp = await callDataSet({ data, serviceRequestTimeout });
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
        content: `Action: ${Name} | Response: ${resp}`,
        jsonRefData:resp,
        logType: 'info',
        actionName: Name,
        actionKey: Key,
        currentFlowId: flowId,
        timeout: serviceRequestTimeout,
      });
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [Dataset] Response: ${JSON.stringify(resp)}`);
    } catch (err) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [Dataset] Call API error: ${err.message}`);

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
        content:
          (err.response &&
            `Action: ${Name} | Error: Can not add to dataset ${DatasetName} | Response: ${JSON.stringify(
              err.response && err.response.data
            )}`) ||
          `Action: ${Name} | Error: Can not add to dataset ${DatasetName} | Message: ${err.message}`,
        logType: 'error',
        actionName: Name,
        actionKey: Key,
        currentFlowId: flowId,
        timeout: serviceRequestTimeout,
      });

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.REPORT.REPORT_API_FAILED,
        ERROR_MESSAGE: `Call API report error: ${err.message}. StatusCode: ${err.response && err.response.status}`,
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog();
    }

    return await step.endDialog(step._info.options);
  }
}

module.exports = { DatasetDialog };
