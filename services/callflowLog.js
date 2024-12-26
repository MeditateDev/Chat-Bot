const axios = require('axios').default;
const { CALL_FLOW_HEADERS } = require('../constant');

module.exports = {
  async errorLog(contentLog, solution) {
    const config = {
      method: 'POST',
      url: process.env.CALLFLOW_DOMAIN + '/system/SystemLog',
      data: {
        logLevel: 'error',
        source: 'chatbot',
        message: JSON.stringify(contentLog),
        resolution: solution,
      },
      headers: CALL_FLOW_HEADERS(),
    };

    try {
      await axios(config);
    } catch (e) {
      console.error(`[errorLog] Insert log to call failed - Data : ${JSON.stringify(config)} - Error : ${e.message}`);
    }
  },
  async logRecognizeNoIntent({
    companyId,
    callFlowId,
    callId,
    text,
    voice = '',
    grammarType,
    grammarName,
    responseList = [],
  }) {
    const config = {
      method: 'POST',
      url: process.env.CALLFLOW_DOMAIN + '/system/CallerResponseTrain',
      data: { companyId, callFlowId, callId, text, voice, grammarType, grammarName, source: 'Chatbot', responseList },
      headers: CALL_FLOW_HEADERS(),
    };

    try {
      await axios(config);
    } catch (e) {
      console.error(
        `[logRecognizeNoIntent] Insert log to call failed - Data : ${JSON.stringify(config)} - Error : ` + e.message
      );
      console.error(e.response && e.response.data);
    }
  },
  async traceLog({
    content,
    from,
    sender,
    recipient,
    companyId,
    callId,
    callFlowId,
    data,
    isProactive,
    allowLogInfo,
    logType,
    actionName,
    actionKey,
    currentFlowId,
    jsonRefData = '',
    timeout = 30,
  }) {
    if (process.env.ENABLE_TRACE_LOG_TO_CALLFLOW != '1') return;

    let configData = {
      type: 'Message',
      companyId: companyId,
      callId: callId,
      fromNumber: sender || from || 'User',
      toNumber: recipient || 'Bot',
      logContent: content,
      attribute: JSON.stringify(data),
      callFlowId: callFlowId,
      logType: logType,
      actionName,
      actionKey,
      currentFlowId,
      jsonRefData: JSON.stringify(jsonRefData),
    };

    if (!allowLogInfo && (logType === 'error' || logType === 'debug')) {
      configData = {
        ...configData,
        attribute: JSON.stringify({
          DIAL_NUMBER: data.DIAL_NUMBER,
          UNIQUEID: data.UNIQUEID,
          CALLER_NUMBER: data.CALLER_NUMBER,
          LANGUAGE: data.LANGUAGE,
        }),
      };
    }

    let config = {
      url: process.env.CALLFLOW_DOMAIN + '/system/TraceLog',
      method: 'POST',
      headers: CALL_FLOW_HEADERS(),
      data: configData,
      timeout: timeout * 1000,
    };

    try {
      if (config.data.logType === 'debug' || config.data.logType === 'error' || allowLogInfo) {
        await axios(config);

        return { result: true };
      }
    } catch (err) {
      console.error(`[traceLog] Insert log to call failed - Data : ${JSON.stringify(config)} - Error : ` + err.message);
      console.error(err.response && err.response.data);
      console.error(err.stack);

      return { result: false, error: err };
    }

    return { result: true };
  },
};
