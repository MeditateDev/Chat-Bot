const { ComponentDialog, WaterfallDialog } = require('botbuilder-dialogs');
const { callflowLog, service } = require('../services');

const {
  paramsExtract,
  replaceObjWithParam,
  tryParseJSON,
  detectChangedValues,
  assignValueToObject,
} = require('../util/helper');
const { CUSTOM_FUNCTION_DIALOG, ERROR_CODES } = require('../constant');

const CUSTOM_FUNCTION_WATERFALL = 'CUSTOM_FUNCTION_WATERFALL';

class CustomFunctionDialog extends ComponentDialog {
  constructor(dialog) {
    super(CUSTOM_FUNCTION_DIALOG);
    this.dialog = dialog;

    this.addDialog(new WaterfallDialog(CUSTOM_FUNCTION_WATERFALL, [this.request_step.bind(this)]));

    this.initialDialogId = CUSTOM_FUNCTION_WATERFALL;
  }

  // send request
  async request_step(step) {
    let { Cases, OtherCases, Params, Attribute, FunctionId, Name, Id, Key } = step._info.options;

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

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [CustomFunction] ${Name} - Key: ${Key}`);

    if (!FunctionId) {
      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.CUSTOM_FUNCTION.FUNCTION_CONFIG_EMPTY,
        ERROR_MESSAGE: `Function id field is empty`,
        CURRENT_ACTION_NAME: Name,
      };

      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [CustomFunction] ${Name} - Key: ${Key} Function field is empty => go to other case`
      );

      return await step.endDialog(OtherCases);
    }

    // get function details
    let functionDetails = {};

    try {
      functionDetails = await service.getFunctionDetails(FunctionId, serviceRequestTimeout);
    } catch (e) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [CustomFunction] ${Name} - Key: ${Key} Can not get function details => go to other case`
      );

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.CUSTOM_FUNCTION.FUNCTION_CONFIG_EMPTY,
        ERROR_MESSAGE: `Can not get function details`,
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog(OtherCases);
    }

    const { code, language, name, codeFormat } = functionDetails;

    const {
      result,
      data: newData,
      error,
    } = await service.CustomFunction({
      FunctionId: FunctionId,
      FunctionName: name,
      CompanyId: companyId,
      Code: code,
      FormattedCode: codeFormat,
      CodeLanguage: language,
      Params: replaceObjWithParam(data || {}, paramsExtract(Params)) || {},
      ConversationData: data,
      timeout: serviceRequestTimeout,
    });

    if (error) {
      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.CUSTOM_FUNCTION.FUNCTION_FAILED,
        ERROR_MESSAGE: `Call Service Custom Function failed: ${error.message}. StatusCode ${
          error.response && error.response.status
        }`,
        CURRENT_ACTION_NAME: Name,
      };

      callflowLog.errorLog({ message: 'Call api to custom function error', Id, Name, err: error }, 'None');

      await callflowLog.traceLog({
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
          (error.response &&
            error.response.data &&
            `Action : ${Name} | Error: Call api to custom function error | Message: ${JSON.stringify(
              error.response && error.response.data
            )}`) ||
          `Action : ${Name} | Error: Call api to custom function error | Message: ${error.message}`,
        logType: 'error',
        actionName: Name,
        actionKey: Key,
        currentFlowId: flowId,
        timeout: serviceRequestTimeout,
      });

      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [CustomFunction] ${Name} - Key: ${Key} error when calling API custom function => go to other case`
      );

      return await step.endDialog(OtherCases);
    }

    if (newData) {
      conversationData.data = {
        ...conversationData.data,
        ...(typeof newData == 'string' ? { ...tryParseJSON(newData) } : newData),
      };

      console.info(
        `[${conversationId} - ${flowId} - ${flowName}] [CustomFunction] ${Name} - Key: ${Key} new changed data: ${JSON.stringify(
          detectChangedValues(data, conversationData.data)
        )}`
      );
    }

    assignValueToObject(conversationData.data, Attribute, result);

    if (result === false) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [CustomFunction] ${Name} - Key: ${Key} Custom function result return false => go to other case`
      );
      return await step.endDialog(OtherCases);
    }

    console.log(
      `[${conversationId} - ${flowId} - ${flowName}] [CustomFunction] ${Name} - Key: ${Key} call API custom function success => go to success case`
    );
    //next case
    return await step.endDialog(Cases);
  }
}

module.exports = {
  CustomFunctionDialog,
};
