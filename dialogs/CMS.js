const { ComponentDialog, WaterfallDialog } = require('botbuilder-dialogs');

const { CMS_DIALOG, CALL_FLOW_HEADERS, ERROR_CODES } = require('../constant');
const { replaceObjWithParam, tryParseJSON, replaceStrWithParam, isFalse } = require('../util/helper');
const { default: axios } = require('axios');
const { traceLog } = require('../services/callflowLog');
const { mapCMSData, callCMS } = require('../services/service');

const CMS_WATERFALL = 'CMS_WATERFALL';

class CMSDialog extends ComponentDialog {
  constructor(dialog) {
    super(CMS_DIALOG);
    this.dialog = dialog;

    this.addDialog(new WaterfallDialog(CMS_WATERFALL, [this.handleCMS.bind(this)]));

    this.initialDialogId = CMS_WATERFALL;
  }

  // ask
  async handleCMS(step) {
    const {
      Key,
      Name,
      Cases,
      OtherCases,
      Method,
      CmsId,
      DataCMS,
      OrderBy,
      QueryLimit,
      SortBy,
      UpdateFields,
      ConditionsType,
      Conditions,
      Attribute,
    } = step._info.options;

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

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [CMS] ${Name} - Key : ${Key}`);

    const cmsObj = mapCMSData(DataCMS);

    const stringCMSData = JSON.stringify(replaceObjWithParam(data, cmsObj));

    if (isFalse(Method) || isFalse(CmsId)) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [CMS] Missing required params => go to other case`);

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.DATA_STORAGES.DATA_STORAGE_FIELD_EMPTY,
        ERROR_MESSAGE: `Required field (Method, data storage id) is empty`,
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog(OtherCases);
    }

    const { result, error } = await callCMS({
      Id: CmsId,
      Method,
      DataCMS: stringCMSData,
      Conditions: replaceStrWithParam(data, Conditions),
      QueryLimit,
      OrderBy,
      SortBy,
      ConditionsType,
      DataUpdate: replaceStrWithParam(data, UpdateFields),
      timeout: serviceRequestTimeout,
    });

    if (error) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [CMS] Call CMS failed: ${error} => go to other case`);

      await traceLog({
        from,
        sender,
        recipient,
        companyId,
        callId,
        callFlowId,
        data,
        allowLogInfo,
        content: `Action : ${Name} | Error: Call CMS failed - ${error.message || error}`,
        logType: 'error',
        actionName: Name,
        actionKey: Key,
        currentFlowId: flowId,
        timeout: serviceRequestTimeout,
      });

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.DATA_STORAGES.DATA_STORAGE_API_FAILED,
        ERROR_MESSAGE: `Call API data storage failed: ${error.message || error}. StatusCode: ${
          error.response && error.response.statusCode
        }`,
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog(OtherCases);
    }

    if (result && Attribute) {
      conversationData.data = {
        ...conversationData.data,
        [Attribute]: result,
      };
    }

    await traceLog({
      from,
      sender,
      recipient,
      companyId,
      callId,
      callFlowId,
      data,
      allowLogInfo,
      content: `Action : ${Name} | Call CMS success | Result : ${
        (typeof result == 'object' && JSON.stringify(result)) || result
      }`,
      logType: 'info',
      actionName: Name,
      actionKey: Key,
      currentFlowId: flowId,
    });

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [CMS] Call CMS success => go to success case`);
    return await step.endDialog(Cases);
  }
}

module.exports = {
  CMSDialog,
};
