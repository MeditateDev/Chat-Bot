const { default: axios } = require('axios');
const { ComponentDialog, WaterfallDialog } = require('botbuilder-dialogs');

const {
  paramsExtract,
  isFalse,
  setAttributes,
  replaceStrWithParam,
  replaceObjWithParam,
  detectChangedValues,
  assignValueToObject,
  tryParseJSON,
} = require('../util/helper');

const { HTTP_REQUEST_DIALOG, ERROR_CODES } = require('../constant');

const { traceLog } = require('../services/callflowLog');

const HTTP_REQUEST_WATERFALL = 'HTTP_REQUEST_WATERFALL';

class HTTPRequestDialog extends ComponentDialog {
  constructor(dialog) {
    super(HTTP_REQUEST_DIALOG);
    this.dialog = dialog;

    this.addDialog(new WaterfallDialog(HTTP_REQUEST_WATERFALL, [this.request_step.bind(this)]));

    this.initialDialogId = HTTP_REQUEST_WATERFALL;
  }

  // send request
  async request_step(step) {
    let {
      Cases,
      OtherCases,
      Attribute,
      Method,
      Body,
      Url,
      Headers,
      Name,
      Key,
      Response,
      Params,
      BodyRaw,
      Option,
      Timeout,
      TypeRaw,
      Log,
      StatusCode,
      HeaderResponse,
      SelectedOptionLog,
      Retry,
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

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [HTTPRequest] ${Name} - Key: ${Key}`);

    const parseHeader = (Headers && replaceObjWithParam(data, paramsExtract(Headers))) || {};

    const handleData = handleRequest(data, Option, Body, BodyRaw, TypeRaw, parseHeader);

    let config = {
      method: Method,
      url: replaceStrWithParam(data, Url),
      params: replaceObjWithParam(data, paramsExtract(Params)),
      data: handleData.requestBody,
      timeout: (!isFalse(Timeout) && Timeout * 1000) || 5000,
      headers: handleData.headers,
    };

    if (!config.url) {
      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.HTTP_REQUEST.HTTP_URL_EMPTY,
        ERROR_MESSAGE: `Url is empty`,
        CURRENT_ACTION_NAME: Name,
      };

      console.log(`[${conversationId} - ${flowId} - ${flowName}] [HTTPRequest] Url is empty => go to other case`);

      return await step.endDialog(OtherCases);
    }

    try {
      const attributes = paramsExtract(Attribute);

      console.log(`[${conversationId} - ${flowId} - ${flowName}] [HTTPRequest] ${JSON.stringify(config)}`);

      const resp = await axios(config);

      if (Log && resp) {
        const content = handleSelectedOptionLog(config, resp, SelectedOptionLog);

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
          content: 'HTTP Request Details',
          logType: 'info',
          actionName: Name,
          actionKey: Key,
          currentFlowId: flowId,
          jsonRefData: {
            url: config.url,
            ...content,
            result: 'Success',
          },
          timeout: serviceRequestTimeout,
        });
      }

      assignValueToObject(conversationData.data, Response, resp.data);

      conversationData.data = setAttributes(conversationData.data, attributes, resp.data);

      if (HeaderResponse && resp.headers) {
        console.log(
          `[${conversationId} - ${flowId} - ${flowName}] [HTTPRequest] Stored headers to ${HeaderResponse}: ${JSON.stringify(
            resp.headers
          )}`
        );
        conversationData.data = {
          ...conversationData.data,
          [HeaderResponse]: resp.headers,
        };
      }

      if (StatusCode && resp.status) {
        console.log(
          `[${conversationId} - ${flowId} - ${flowName}] [HTTPRequest] Stored status to ${StatusCode}: ${resp.status}`
        );
        conversationData.data = {
          ...conversationData.data,
          [StatusCode]: resp.status,
        };
      }

      console.info(
        `[${conversationId} - ${flowId} - ${flowName}] [HTTPRequest] ${Name} - Key: ${Key} new changed data: ${JSON.stringify(
          detectChangedValues(data, conversationData.data)
        )}`
      );
    } catch (err) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [HTTPRequest] ${Name} - Key: ${Key} call API failed: ${err.message}`
      );

      if (err.response) {
        console.log(
          `[${conversationId} - ${flowId} - ${flowName}] [HTTPRequest] ${Name} - Key: ${Key} response data ${JSON.stringify(
            err.response.data
          )}`
        );
      }

      let content = {
        error: (err.response && err.response.data) || err.message || err,
      };

      if (Log && allowLogInfo) {
        content = handleSelectedOptionLog(config, err, SelectedOptionLog);
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
        content: 'HTTP Request Details',
        logType: 'error',
        actionName: Name,
        actionKey: Key,
        currentFlowId: flowId,
        jsonRefData: {
          url: config.url,
          ...content,
          result: 'failed',
        },
        timeout: serviceRequestTimeout,
      });

      if (err.stack) {
        console.error(`[${conversationId} - ${flowId} - ${flowName}] [HTTPRequest] Error : ${err.message}`);
        console.error(err.stack);
      }

      if (Retry && +Retry > 0) {
        console.log(
          `[${conversationId} - ${flowId} - ${flowName}] [HTTPRequest] ${Name} - Key: ${Key} call API failed => call api again ( attempts left : ${
            Retry - 1
          } )`
        );
        return await step.replaceDialog(HTTP_REQUEST_WATERFALL, { ...step._info.options, Retry: Retry - 1 });
      }

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.HTTP_REQUEST.HTTP_RESPONSE_FAILED,
        ERROR_MESSAGE: `Call API HTTP request failed: ${err.message}. StatusCode: ${err.response && err.response.status}`,
        CURRENT_ACTION_NAME: Name,
      };

      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [HTTPRequest] ${Name} - Key: ${Key} call API failed => go to other case`
      );

      return await step.endDialog(OtherCases);
    }

    console.log(
      `[${conversationId} - ${flowId} - ${flowName}] [HTTPRequest] ${Name} - Key: ${Key} call API success => go to success case`
    );
    return await step.endDialog(Cases);
  }
}

module.exports = {
  HTTPRequestDialog,
};

const handleRequest = (data, option, body, bodyRaw, typeRaw, headers) => {
  let requestBody;
  try {
    // option key pairs
    if (option === '1' && body) {
      headers = { ...headers, 'Content-Type': 'application/json' };
      requestBody = replaceObjWithParam(data, paramsExtract(body));

      return { headers, requestBody };
    }
    // option raw
    if (option === '2' && bodyRaw) {
      switch (typeRaw) {
        case 'json':
          headers = { ...headers, 'Content-Type': 'application/json' };

          let newBody = tryParseJSON(bodyRaw);

          if (Object.keys(newBody).length) {
            requestBody = replaceObjWithParam(data, newBody);
          } else {
            let stringBody = replaceStrWithParam(data, bodyRaw);
            requestBody = tryParseJSON(stringBody);
          }
          break;
        case 'text':
          headers = { ...headers, 'Content-Type': 'text/plain' };
          requestBody = replaceStrWithParam(data, bodyRaw);
          break;
        case 'xml':
          headers = { ...headers, 'Content-Type': 'application/xml' };
          requestBody = replaceStrWithParam(data, bodyRaw);
          break;
        case 'html':
          headers = { ...headers, 'Content-Type': 'text/html' };
          requestBody = replaceStrWithParam(data, bodyRaw);
          break;
        default:
          break;
      }
    }
  } catch (error) {
    console.log(
      `Handle body failed - data: ${JSON.stringify({ data, option, body, bodyRaw, typeRaw })} - error: ${error.message}`
    );
  }
  return { requestBody, headers };
};

const handleSelectedOptionLog = (config, response, selectedOptionLog) => {
  selectedOptionLog = typeof selectedOptionLog == 'string' && tryParseJSON(selectedOptionLog);

  let optionsLog = [];

  if (Array.isArray(selectedOptionLog)) {
    if (!selectedOptionLog.length) return {};
    optionsLog = selectedOptionLog.map((optionLog) => optionLog.toLowerCase());
  }

  response = response.data || (response.response && response.response.data) || response.message;

  const content = {
    params: config.params,
    headers: config.headers,
    body: config.data,
    response: response,
  };

  const result = Object.fromEntries(Object.entries(content).filter(([key]) => optionsLog.includes(key)));

  if (!Object.keys(result).length) return {};

  return result;
};
