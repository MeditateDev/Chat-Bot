const axios = require('axios').default;
const https = require('https');
const { v4: uuidv4 } = require('uuid');
const { errorLog } = require('./callflowLog');
const { mailError } = require('./sendmail');
const { tryParseJSON } = require('../util/helper');

const { BASIC_HEADERS, CALL_FLOW_HEADERS, CHATGPT_HEADERS, ERROR_CODES } = require('../constant');
const { CustomError } = require('../classes/CustomError');
const users = require('./user');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const getFlowWithId = async (callFlowId) => {
  if (!callFlowId) {
    console.log(`FLOW ID IS EMPTY => CAN NOT GET FLOW!`);
    return;
  }

  console.log(`CALL API GET FLOW WITH FLOW ID : ${callFlowId}`);

  let config = {
    method: 'get',
    url: `${process.env.CALLFLOW_DOMAIN}/system/CallFlow/id?id=${callFlowId}`,
    httpsAgent: httpsAgent,
    headers: CALL_FLOW_HEADERS(),
  };

  try {
    let { data } = await axios(config);
    if (!data || !data.id) {
      throw new Error(`API response empty data!`);
    }
    return data;
  } catch (err) {
    console.log(`CAN NOT GET FLOW WITH ID ${callFlowId} - error: ${err.message}`);

    await mailError({
      type: 'API',
      url: `${process.env.CALLFLOW_DOMAIN}/system/CallFlow/id?id=${callFlowId}`,
      message: err.message,
      response: err.response && err.response.data,
      statusCode: err.response && err.response.status,
    });

    errorLog({ config, err }, 'Check CALLFLOW_DOMAIN, callflowId');
  }
};

const getFlowWithPhoneNumber = async (botPhoneNumber) => {
  if (!botPhoneNumber) {
    console.log(`PHONE NUMBER IS EMPTY => CAN NOT GET FLOW WITH PHONE NUMBER`);
    return;
  }

  console.log(`CALL API GET FLOW WITH PHONE NUMBER : ${botPhoneNumber}`);

  let config = {
    method: 'get',
    url: `${process.env.CALLFLOW_DOMAIN}/system/CallFlow/getflow?bot=${botPhoneNumber}`,
    httpsAgent: httpsAgent,
    headers: CALL_FLOW_HEADERS(),
  };

  try {
    const { data } = await axios(config);

    return data;
  } catch (err) {
    console.log(`CAN NOT GET FLOW WITH PHONE NUMBER: ${botPhoneNumber} - Error: ${err.message}`);

    await mailError({
      type: 'API',
      url: `${process.env.CALLFLOW_DOMAIN}/system/CallFlow/getflow?bot=${botPhoneNumber}`,
      message: err.message,
      response: err.response && err.response.data,
      statusCode: err.response && err.response.status,
    });

    errorLog({ config, err }, 'Check CALLFLOW_DOMAIN, phone number');
  }
};

const getPrediction = async (companyId, GrammarName, text, lang, timeout = 30) => {
  if (!companyId || !GrammarName || !text) {
    console.log(`[getPrediction] missing companyId, GrammarName or text! => return`);
    return;
  }

  const language = (lang && lang.split('-')[0]) || 'en';

  let config = {
    method: 'POST',
    url: process.env.INTENT_SERVICE_URL + `/predict/${companyId + `_` + language + `_` + GrammarName}`,
    data: { text: text },
    headers: BASIC_HEADERS(),
    timeout: timeout * 1000,
  };

  try {
    console.info(JSON.stringify(config));
    const { data } = await axios(config);
    console.log(`[getPrediction] ${companyId + `_` + language + `_` + GrammarName} response : ` + JSON.stringify(data));
    return data;
  } catch (err) {
    console.log(`[getPrediction] ${companyId + `_` + language + `_` + GrammarName} can not predict intent : ${err.message}`);

    await mailError({
      type: 'API',
      url: process.env.INTENT_SERVICE_URL + `/predict/${companyId + `_` + language + `_` + GrammarName}`,
      message: err.message,
      request: config.data,
      response: err.response && err.response.data,
      statusCode: err.response && err.response.status,
    });

    errorLog({ config, err }, 'Check refId, INTENT_SERVICE_URL, AUTHORIZATION_TOKEN');

    throw new CustomError(
      `[getPrediction] ${companyId + `_` + language + `_` + GrammarName} can not predict intent : ${err.message}`,
      ERROR_CODES.INTENTSVC_FAILED,
      `Call Service Intent failed : ${err.message}. StatusCode: ${err.response && err.response.status}`
    );
  }
};

const recognizeChatGPT = async (directory, text, language = '', query_mode, timeout = 30) => {
  if (!directory || !text) {
    console.log(`[recognizeChatGPT] Receive empty directory or text => return`);
    return;
  }

  let config = {
    method: 'POST',
    url: process.env.CHATGPT_SERVICE_URL + `/api/recognize`,
    data: {
      input: text.toString(),
      ref_id: directory,
      api_key: process.env.CHATGPT_API_KEY,
      language,
      query_mode: query_mode || 'EMBEDDING',
    },
    headers: CHATGPT_HEADERS(),
    timeout: timeout * 1000,
  };

  try {
    console.log(JSON.stringify(config));
    let { data } = await axios(config);
    console.log(`[recognizeChatGPT] Response ChatGPT : ${JSON.stringify(data)}`);
    return data;
  } catch (err) {
    console.log(`[recognizeChatGPT] Call API to recognize with ChatGPT failed : ${err.message}`);
    console.log(err.response && err.response.data);

    await mailError({
      type: 'API',
      url: process.env.CHATGPT_SERVICE_URL + `/api/recognize`,
      message: err.message,
      request: config.data,
      response: err.response && err.response.data,
      statusCode: err.response && err.response.status,
    });

    errorLog({ config, err }, 'Check CHATGPT_SERVICE_URL, CHATGPT_API_KEY, CHATGPT_AUTHORIZATION_TOKEN');

    throw new CustomError(
      `[recognizeChatGPT] Call API to recognize with ChatGPT failed : ${err.message}`,
      ERROR_CODES.GPT_FAILED,
      `Call Service GPT failed : ${err.message}. StatusCode: ${err.response && err.response.status}`
    );
  }
};

const qaChatGPT = async ({
  directory,
  text,
  type = '',
  prompt = 'Assuming you are IT support',
  response_mode,
  temperature = '0.3',
  num_output = '512',
  language = '',
  keep_context,
  session_id = '',
  first_prompt = '',
}) => {
  if (!directory || !text) {
    console.log(`[qaChatGPT] Receive empty directory or text => return`);
    return;
  }

  let virtualPath = type === 'URL' ? `/api/page-reader` : `/api/docs-reader`;
  let config = {
    method: 'POST',
    url: process.env.CHATGPT_SERVICE_URL + virtualPath,
    data: {
      input: text.toString(),
      ref_id: directory,
      api_key: process.env.CHATGPT_API_KEY,
      prompt,
      language,
      response_mode,
      temperature,
      num_output,
      keep_context,
      session_id,
      first_prompt,
    },
    headers: CHATGPT_HEADERS(),
  };

  try {
    console.log(JSON.stringify(config));
    let { data } = await axios(config);
    console.log(`[qaChatGPT] Response : ${JSON.stringify(data)}`);
    return {
      ...data,
      data: data && (data.data || data.answer),
    };
  } catch (err) {
    console.log(`[qaChatGPT] Call API to recognize with ChatGPT failed : ` + err.message);
    console.log(err.response && err.response.data);

    await mailError({
      type: 'API',
      url: process.env.CHATGPT_SERVICE_URL + virtualPath,
      message: err.message,
      request: config.data,
      response: err.response && err.response.data,
      statusCode: err.response && err.response.status,
    });

    errorLog({ config, err }, 'Check CHATGPT_SERVICE_URL, CHATGPT_API_KEY, CHATGPT_AUTHORIZATION_TOKEN');
  }
};

const addConversation = async (user, message, isOut, manual, msgRefId) => {
  if (!process.env.LINKSCOPE_API_URL) {
    console.log(`Not insert conversation to db because LINKSCOPE_API_URL is empty`);
    return;
  }

  const conv = {};

  conv.ContactMessageUID = user.id;

  conv.MessageId = uuidv4();
  if (isOut) {
    if (!manual) {
      conv.SenderName = 'AutoMessage';
    } else {
      conv.SenderName = user.activity.recipient.name;
    }
    conv.ReceiverID = user.id;
    conv.ReceiverName = user.name;

    conv.SenderID = user.activity.recipient.id;
    conv.Direction = 'O';
  } else {
    conv.SenderID = user.id;
    conv.SenderName = user.name;
    conv.ReceiverID = user.activity.recipient.id;
    conv.ReceiverName = user.activity.recipient.name;
    conv.Direction = 'I';
  }

  if (user.contactMessage && user.contactMessage.AgentID) {
    conv.AgentID = user.contactMessage.AgentID;
  }

  if (!conv.AgentID && user.agentID) {
    conv.AgentID = user.agentID;
  }

  if (!user.finalStep || user.acceptFQ || (!isOut && !manual)) {
    conv.Status = 'Ignore';
  } else if (isOut && message == '[AutoReplyMessage]') {
    conv.Status = 'Replied';
    if (user.agentName) {
      message = 'Hello, my name is ' + user.agentName;
    } else if (user.agentID) {
      message = 'Hello, I am agent #' + user.agentID;
    } else {
      message = 'Hello, How can I help you today?';
    }
    conv.SenderName = user.agentName;
    if (user.agentID) {
      conv.SenderID = user.agentID;
    } else {
      conv.SenderID = user.activity.recipient.id;
    }
  } else {
    conv.Status = 'Ignore';
  }

  if (user.newStatus) {
    conv.Status = 'New';
    user.newStatus = false;
    users.update(user);
  }

  if (!user.talkToLastAgent == 'N') {
    conv.AgentID = '';
  }

  conv.ReasonContact = user.reason;
  conv.VDN = user.vdn;
  conv.Content = message;
  conv.PhoneNumber = user.phone;
  conv.LinkScopeID = user.linkScopeID;
  conv.AddressObj = JSON.stringify(user.activity);
  conv.RefID = msgRefId;

  try {
    const resp = await axios({
      method: 'POST',
      url: process.env.LINKSCOPE_API_URL + '/contactmessages/conversation',
      data: conv,
      headers: BASIC_HEADERS(),
    });

    if (resp && resp.data && resp.data.ContactMessage) {
      console.log(`Insert conv - data: ${message} - success: 'true`);
      return resp.data;
    } else {
      throw new Error(`Insert conv - data: ${message} - success: 'failed - Invalid response'`);
    }
  } catch (err) {
    console.log(`[addConversation] Call API failed: ${err.message}`);

    await mailError({
      type: 'API',
      url: process.env.LINKSCOPE_API_URL + '/contactmessages/conversation',
      message: err.message,
      request: conv,
      response: err.response && err.response.data,
      statusCode: err.response && err.response.status,
    });

    return;
  }
};

const getContactMessageByUserID = async (userID) => {
  if (!process.env.LINKSCOPE_API_URL) return;
  return await axios({
    method: 'GET',
    url: process.env.LINKSCOPE_API_URL + '/contactmessages/conversations/' + userID,
    headers: BASIC_HEADERS(),
  })
    .then(({ data: response }) => {
      const result = response.result.length > 0 ? response.result[0] : null;
      if (result) {
        const { AddressObj, ...rest } = result;
        console.log(`Contact message: ${JSON.stringify(rest && rest.ConversationID)}`);
      } else {
        console.log(`Could not found ctm by id: ${userID}`);
      }
      return result;
    })
    .catch(async (err) => {
      console.log(`getContactMessageByUserID failed : ${err.message}`);

      await mailError({
        type: 'API',
        url: process.env.LINKSCOPE_API_URL + '/contactmessages/conversations/' + userID,
        message: err.message,
        response: err.response && err.response.data,
        statusCode: err.response && err.response.status,
      });

      errorLog(err);
      return;
    });
};

const agentReplied = async (user) => {
  if (!process.env.LINKSCOPE_API_URL) return;
  const conversationID = user.id;
  return await axios({
    url: process.env.LINKSCOPE_API_URL + '/contactmessages/agentreplied/' + conversationID,
    method: 'GET',
    headers: BASIC_HEADERS(),
  })
    .then(({ data }) => data)
    .catch(async function (err) {
      console.log(`agentReplied - userId: ${user.id} - resp: ${JSON.stringify(err.message)}`);

      await mailError({
        type: 'API',
        url: process.env.LINKSCOPE_API_URL + '/contactmessages/agentreplied/' + conversationID,
        message: err.message,
        response: err.response && err.response.data,
        statusCode: err.response && err.response.status,
      });

      errorLog(err);
    });
};

const getContact = (body) => {
  if (!process.env.LINKSCOPE_API_URL) return;
  return axios({
    method: 'POST',
    url: process.env.LINKSCOPE_API_URL + '/screenpop/contact',
    headers: BASIC_HEADERS(),
    data: body,
  })
    .then(({ data }) => data)
    .catch(async (e) => {
      console.log('Error: getContact ' + e.message);

      await mailError({
        type: 'API',
        url: process.env.LINKSCOPE_API_URL + '/screenpop/contact',
        message: e.message,
        request: body,
        response: e.response && e.response.data,
        statusCode: e.response && e.response.status,
      });

      errorLog(e);
      return null;
    });
};

const getAMQP = async () => {
  if (!process.env.LINKSCOPE_API_URL) return;
  return await axios({
    url: process.env.LINKSCOPE_API_URL + '/setting/amqpconnection',
    method: 'GET',
    headers: BASIC_HEADERS(),
  })
    .then(({ data }) => data && (typeof data.result == 'string' ? JSON.parse(data.result) : data.result))
    .catch(async function (err) {
      console.log(`getAMQP failed - resp: ${JSON.stringify(err.message)}`);

      await mailError({
        type: 'API',
        url: process.env.LINKSCOPE_API_URL + '/setting/amqpconnection',
        message: err.message,
        response: err.response && err.response.data,
        statusCode: err.response && err.response.status,
      });

      errorLog(err);
    });
};

const getCallFlowSetting = async () =>
  axios({
    url: process.env.CALLFLOW_DOMAIN + '/system/configuration',
    method: 'GET',
    headers: CALL_FLOW_HEADERS(),
  })
    .then(({ data }) => data)
    .catch(async function (err) {
      console.log(`getCallFlowSetting failed - resp: ${JSON.stringify((err.response && err.response.data) || err.message)}`);

      await mailError({
        type: 'API',
        url: process.env.CALLFLOW_DOMAIN + '/system/configuration',
        message: err.message,
        response: err.response && err.response.data,
        statusCode: err.response && err.response.status,
      });

      errorLog({
        config: {
          url: process.env.CALLFLOW_DOMAIN + '/system/configuration',
          method: 'GET',
          headers: CALL_FLOW_HEADERS(),
        },
        err,
      });
    });

const GPTChatService = async (sessionId = '', text, prompt = 'Assuming you are IT support', language = '') => {
  let config = {
    method: 'POST',
    url: process.env.CHATGPT_SERVICE_URL + '/api/conversation',
    data: {
      input: text && text.toString(),
      api_key: process.env.CHATGPT_API_KEY,
      session_id: sessionId,
      prompt,
      language,
    },
    headers: CHATGPT_HEADERS(),
  };

  try {
    console.log(JSON.stringify(config));
    let { data } = await axios(config);
    console.log(`[GPTChatService] Response : ${JSON.stringify(data)}`);
    return {
      ...data,
      data: data && (data.data || data.answer),
    };
  } catch (err) {
    console.log('[GPTChatService] error : ' + err.message);
    console.log(err.response && err.response.data);

    await mailError({
      type: 'API',
      url: process.env.CHATGPT_SERVICE_URL + '/api/conversation',
      request: config.data,
      message: err.message,
      response: err.response && err.response.data,
      statusCode: err.response && err.response.status,
    });

    errorLog({ config, err }, 'Check CHATGPT_SERVICE_URL, CHATGPT_API_KEY, CHATGPT_AUTHORIZATION_TOKEN');
  }
};

const getChannel = async (contactId) => {
  try {
    const { data } =
      (await axios.get(process.env.SERVICE_URL + '/get-channel/' + contactId, {
        headers: BASIC_HEADERS(),
      })) || {};
    return data;
  } catch (e) {
    console.log(`[getChannel] Call api failed - contactId : ${contactId} - error: ` + e.message);

    await mailError({
      type: 'API',
      url: process.env.SERVICE_URL + '/get-channel/' + contactId,
      message: e.message,
      response: e.response && e.response.data,
      statusCode: e.response && e.response.status,
    });

    console.log(e.response && e.response.data);
  }
};

const CustomFunction = async ({
  FunctionId,
  FunctionName,
  CompanyId,
  Code,
  FormattedCode,
  CodeLanguage,
  Params,
  ConversationData,
  timeout,
}) => {
  if (CodeLanguage === 'JS') {
    return await JSCustomFunction({
      FunctionId,
      FunctionName,
      CompanyId,
      Code,
      FormattedCode,
      CodeLanguage,
      Params,
      ConversationData,
      timeout,
    });
  }

  return await PHPCustomFunction({
    FunctionId,
    FunctionName,
    CompanyId,
    Code,
    FormattedCode,
    CodeLanguage,
    Params,
    ConversationData,
    timeout,
  });
};

const PHPCustomFunction = async ({
  FunctionId,
  FunctionName,
  CompanyId,
  Code,
  FormattedCode,
  CodeLanguage,
  Params,
  ConversationData,
  timeout = 30,
}) => {
  let body = {
    functionId: FunctionId,
    functionName: FunctionName,
    companyId: CompanyId,
    code: Code,
    executedCode: FormattedCode,
    codeLanguage: CodeLanguage,
    variables: Params,
    attributes: ConversationData,
  };

  let config = {
    url: process.env.PHP_CUSTOM_FUNCTION_URL + `/customfunction.php`,
    method: 'POST',
    data: body,
    timeout: timeout * 1000,
    headers: CALL_FLOW_HEADERS(),
  };

  try {
    console.log(
      `[PHPCustomFunction] Body : ` +
        JSON.stringify({
          FunctionId,
          FunctionName,
          CompanyId,
          CodeLanguage,
          Params,
        })
    );

    let { data } = await axios(config);

    console.info(`[PHPCustomFunction]  ${FunctionId} ${FunctionName} Custom function response : ${JSON.stringify(data)}`);

    if (!data || !data.data) throw new Error(`Invalid response from custom function`);

    console.log(`[PHPCustomFunction] ${FunctionId} ${FunctionName} result: ${JSON.stringify(data.data.result)}`);

    return { result: data.data.result, data: data.data.attributes };
  } catch (e) {
    console.log(`[PHPCustomFunction] Call API Custom function ${FunctionId} ${FunctionName} failed - Error: ${e.message}`);
    console.log((e.response && e.response.data) || '');
    console.log(e.stack);

    await mailError({
      type: 'CUSTOM_FUNCTION',
      url: config.url,
      message: e.message,
      request: Params,
      statusCode: (e.response && e.response.status) || 'No status code',
      functionId: FunctionId,
      response: (e.response && e.response.data) || 'No response',
    });

    return { result: false, error: e };
  }
};

const JSCustomFunction = async ({
  FunctionId,
  FunctionName,
  CompanyId,
  Code,
  FormattedCode,
  CodeLanguage,
  Params,
  ConversationData,
  timeout = 30,
}) => {
  const config = {
    url: process.env.JS_CUSTOM_FUNCTION_URL + `/custom-function/run`,
    method: 'POST',
    data: {
      functionId: FunctionId,
      functionName: FunctionName,
      companyId: CompanyId,
      code: Code,
      executedCode: FormattedCode,
      codeLanguage: CodeLanguage,
      variables: Params,
      attributes: ConversationData,
    },
    timeout: timeout * 1000,
    headers: CALL_FLOW_HEADERS(),
  };

  try {
    console.log(
      `[JSCustomFunction] ` +
        JSON.stringify({
          FunctionId,
          FunctionName,
          CompanyId,
          CodeLanguage,
          Params,
        })
    );
    const { data } = await axios(config);

    console.info(`[JSCustomFunction] ${FunctionId} ${FunctionName} Custom function response : ${JSON.stringify(data)}`);

    if (!data || !data.data) throw new Error(`Invalid response from custom function`);

    console.log(`[JSCustomFunction] ${FunctionId} ${FunctionName} result: ${JSON.stringify(data.data.result)}`);

    return { result: data.data.result, data: data.data.attributes };
  } catch (e) {
    console.log(`[JSCustomFunction] call API custom function  ${FunctionId} ${FunctionName} failed ` + e.message);

    await mailError({
      type: 'CUSTOM_FUNCTION',
      url: config.url,
      message: e.message,
      request: Params,
      statusCode: (e.response && e.response.status) || 'No status code',
      functionId: FunctionId,
      response: (e.response && e.response.data) || 'No response',
    });

    return { result: false, error: e };
  }
};

const saveConversationState = async ({ ContactMessageUID, ConversationData, DialogStack, AddressObj }) => {
  if (!process.env.LINKSCOPE_API_URL) return;

  try {
    const { data } = await axios({
      method: 'POST',
      url: process.env.LINKSCOPE_API_URL + '/contactmessages/conversation-data',
      headers: BASIC_HEADERS(),
      data: {
        ContactMessageUID,
        ConversationData: JSON.stringify(ConversationData),
        DialogStack: JSON.stringify(DialogStack),
        AddressObj: JSON.stringify(AddressObj),
      },
    });

    if (!data || data.error) {
      throw new Error(JSON.stringify(data.error));
    }
  } catch (e) {
    await mailError({
      type: 'API',
      url: process.env.LINKSCOPE_API_URL + '/contactmessages/conversation-data',
      message: e.message,
      response: e.response && e.response.data,
      statusCode: e.response && e.response.status,
    });

    console.log('[saveConversationState] Save conversation state failed: ' + e.message);
  }
};

const getGrammarDetails = async (id, timeout = 30) => {
  try {
    const { data } = await axios({
      url: process.env.CALLFLOW_DOMAIN + '/system/Grammar/id?id=' + id,
      headers: CALL_FLOW_HEADERS(),
      timeout: timeout * 1000,
    });

    console.log(`[GetGrammarDetails] response : ${JSON.stringify(data)}`);

    return data;
  } catch (e) {
    console.log(
      `[GetGrammarDetails] Can not get grammar details - IdGrammar : ${id} - Error: ${
        e.message
      } - Response: ${JSON.stringify(e.response && e.response.data)}`
    );

    await mailError({
      type: 'API',
      url: process.env.CALLFLOW_DOMAIN + '/system/Grammar/id?id=' + id,
      message: e.message,
      response: e.response && e.response.data,
      statusCode: e.response && e.response.status,
    });

    throw new CustomError(
      `Can not get grammar details - IdGrammar : ${id} - Error: ${e.message} - Response: ${JSON.stringify(
        e.response && e.response.data
      )}`,
      ERROR_CODES.GRAMMAR_DETAILS_FAILED,
      `Call API get grammar details failed: ${e.message}. StatusCode: ${
        e.response && e.response.status && e.response.status
      }`
    );
  }
};

const getFunctionDetails = async (id, timeout = 30) => {
  try {
    const { data } = await axios({
      url: process.env.CALLFLOW_DOMAIN + '/system/CustomFunction/id?id=' + id,
      headers: CALL_FLOW_HEADERS(),
      timeout: timeout * 1000,
    });

    console.info(`[getFunctionDetails] response : ${JSON.stringify(data)}`);

    if (!data || typeof data !== 'object') {
      throw new Error(`Invalid response from API`);
    }

    return data;
  } catch (e) {
    console.log(`[getFunctionDetails] Get function detail failed - FunctionId: ${id} - Error :` + e.message);

    await mailError({
      type: 'API',
      url: process.env.CALLFLOW_DOMAIN + '/system/CustomFunction/id?id=' + id,
      message: e.message,
      response: e.response && e.response.data,
      statusCode: e.response && e.response.status,
    });

    throw new CustomError(
      `Call API get function detail failed - FunctionId: ${id} - Error : ${e.message}`,
      ERROR_CODES.FUNCTION_DETAILS_FAILED,
      `Call API get custom function detail failed: ${e.message}. StatusCode: ${e.response && e.response.status}`
    );
  }
};

const getGPTDirectory = async (id) => {
  try {
    const { data } = await axios({
      url: process.env.CALLFLOW_DOMAIN + '/system/ChatGPT/directory?id=' + id,
      headers: CALL_FLOW_HEADERS(),
    });

    console.log(`[getGPTDirectory] response : ${JSON.stringify(data)}`);

    return data;
  } catch (e) {
    console.log(`[getGPTDirectory] Get GPT directory failed - Directory id: ${id} - Error :` + e.message);

    await mailError({
      type: 'API',
      url: process.env.CALLFLOW_DOMAIN + '/system/ChatGPT/directory?id=' + id,
      message: e.message,
      response: e.response && e.response.data,
      statusCode: e.response && e.response.status,
    });

    throw new CustomError(
      `[getGPTDirectory] Get GPT directory failed - Directory id: ${id} - Error : ${e.message}`,
      ERROR_CODES.GPT_DIRECTORY_FAILED,
      `Call API get directory failed: ${e.message}. Status code: ${e.response && e.response.status}`
    );
  }
};

const sendMail = async ({
  templateVariable,
  emailRecipients,
  templateCustom,
  emailAddress,
  emailSubject,
  template,
  optionTemplate,
}) => {
  const config = {
    method: 'POST',
    url: process.env.CALLFLOW_DOMAIN + '/system/Email/sendmail',
    headers: CALL_FLOW_HEADERS(),
    data: {
      templateVariable,
      emailRecipients,
      templateCustom,
      emailAddress,
      emailSubject,
      template,
      optionTemplate,
    },
  };
  try {
    console.log(JSON.stringify(config));

    const { data } = await axios(config);

    return { result: !!data };
  } catch (e) {
    console.log(`Call API send mail failed :`, e.message);

    await mailError({
      type: 'API',
      url: process.env.CALLFLOW_DOMAIN + '/system/Email/sendmail',
      request: config.data,
      message: e.message,
      response: e.response && e.response.data,
      statusCode: e.response && e.response.status,
    });

    return { result: false, error: e };
  }
};

const postChatClientEndConversation = async (msgUid) => {
  if (!process.env.LINKSCOPE_WEB_APP_URL) return;
  try {
    const config = {
      method: 'POST',
      url: process.env.LINKSCOPE_WEB_APP_URL + '/CustomAPIDLL/HandleCustomerOutChat',
      headers: BASIC_HEADERS(),
      data: {
        MessageUID: msgUid,
      },
    };

    console.log(`[postChatClientEndConversation] request: ${JSON.stringify(config)}`);

    const resp = await axios(config);

    console.log(`[postChatClientEndConversation] response: ${JSON.stringify(resp.data)}`);
  } catch (e) {
    console.log(`postChatClientEndConversation - msgUid: ${msgUid} - err: ${e.message}`);

    await mailError({
      type: 'API',
      url: process.env.LINKSCOPE_WEB_APP_URL + '/CustomAPIDLL/HandleCustomerOutChat',
      request: {
        MessageUID: msgUid,
      },
      message: e.message,
      response: e.response && e.response.data,
      statusCode: e.response && e.response.status,
    });

    return false;
  }
};

const getBuiltinFunction = async (name, timeout = 30) => {
  try {
    const { data } = await axios({
      url: process.env.CALLFLOW_DOMAIN + '/system/CustomFunction/built-in-name?name=' + name,
      headers: CALL_FLOW_HEADERS(),
      timeout: timeout * 1000,
    });

    if (!data || typeof data !== 'object') {
      throw new Error(`Invalid response from API`);
    }

    return data;
  } catch (e) {
    console.log(`[getBuiltinFunction] Get function detail failed - FunctionId: ${name} - Error :` + e.message);

    await mailError({
      type: 'API',
      url: process.env.CALLFLOW_DOMAIN + '/system/CustomFunction/built-in-name?name=' + name,
      message: e.message,
      response: e.response && e.response.data,
      statusCode: e.response && e.response.status,
    });

    throw new CustomError(
      `Call API get built-in function details failed - FunctionId: ${name} - Error : ${e.message}`,
      ERROR_CODES.FUNCTION_DETAILS_FAILED,
      `Call API get custom function details failed: ${e.message}. StatusCode: ${e.response && e.response.status}`
    );
  }
};

const callCMS = async ({
  Id,
  Method,
  DataCMS,
  Conditions,
  QueryLimit,
  OrderBy,
  SortBy,
  ConditionsType,
  DataUpdate,
  timeout = 30,
}) => {
  const body = {
    Id,
    Method,
    DataCMS,
    Conditions,
    QueryLimit,
    OrderBy,
    SortBy,
    ConditionsType,
    DataUpdate,
  };

  const config = {
    url: process.env.CALLFLOW_DOMAIN + '/system/CMSData/query',
    method: 'POST',
    headers: CALL_FLOW_HEADERS(),
    data: body,
    timeout: timeout * 1000,
  };

  console.log(JSON.stringify(body));

  try {
    const { data } = await axios(config);

    console.log(`Response :`, data);

    return {
      result: tryParseJSON(data.result),
      error: data.errorMessage || '',
    };
  } catch (e) {
    console.log('Call API CMS error:', e.message);
    return { result: false, error: e };
  }
};

const mapCMSData = (stringData) => {
  try {
    const arrData = JSON.parse(stringData);

    if (!arrData || !Array.isArray(arrData)) throw new Error('Invalid CMS data');

    let result = {};

    arrData.forEach((e) => {
      result = { ...result, [e.uniqueName]: e.value };
    });

    return result;
  } catch (e) {
    console.log(`Map CMS data failed - data : ${stringData} - error: ${e.message}`);
    return {};
  }
};

const callDataSet = async ({ data, serviceRequestTimeout = 30 }) => {
  let config = {
    method: 'POST',
    headers: CALL_FLOW_HEADERS(),
    url: process.env.CALLFLOW_DOMAIN + '/system/calldata',
    data: { ...data },
    timeout: serviceRequestTimeout * 1000,
  };

  let { data: resp } = await axios(config);

  return resp;
};

const updateENV = (data) => {
  const {
    trainGPTKey,
    mailTo,
    trainIntentUrl,
    trainGPTIntentUrl,
    trainGPTAuthenticationToken,
    customFunctionPHPUrl,
    customFunctionUrl,
  } = data;
  const {
    botAuthorizationToken,
    botEnableTraceLogToCallFlow,
    botErrorEncounterMessage,
    botFlowMode,
    botLogMode,
    botMaxLogFiles,
    botMaxLogSize,
    botPhoneNumberCountryCode,
    botResendErrorMailAfter,
    botConnectorUrl,
    botLinkScopeAPIUrl,
    llmPromptDetectIntent,
    llmPromptDetectEntity,
  } = data;

  const newEnvironments = {
    RESEND_ERROR_AFTER: botResendErrorMailAfter || '1',
    ERROR_REPORT_RECIPIENTS: mailTo || '',
    // DEVELOP_MODE: botLogMode || '0',
    ENABLE_TRACE_LOG_TO_CALLFLOW: botEnableTraceLogToCallFlow || '1',
    MAX_FILES: botMaxLogFiles || '50',
    MAX_LOG_SIZE: botMaxLogSize || '20971520',
    CHATGPT_AUTHORIZATION_TOKEN: trainGPTAuthenticationToken,
    CHATGPT_API_KEY: trainGPTKey,
    CHATGPT_SERVICE_URL: trainGPTIntentUrl,
    INTENT_SERVICE_URL: trainIntentUrl,
    FLOW_MODE: botFlowMode || '1',
    PHONE_NUMBER_COUNTRYCODE: botPhoneNumberCountryCode || '1',
    AUTHORIZATION_TOKEN: botAuthorizationToken || 'Zm1QWXpGZGZDWHA6IyVpRGxrdU05UUBZ',
    ERROR_MESSAGE: botErrorEncounterMessage || `Something went wrong please try again later!`,
    SERVICE_URL: botConnectorUrl || `http://localhost:3000/botconnector`,
    LINKSCOPE_API_URL: botLinkScopeAPIUrl,
    JS_CUSTOM_FUNCTION_URL: customFunctionUrl,
    PHP_CUSTOM_FUNCTION_URL: customFunctionPHPUrl,
    LLM_INTENT_PROMPT: llmPromptDetectIntent || '',
    LLM_ENTITY_PROMPT: llmPromptDetectEntity || '',
  };

  console.log(`Environments changed: ` + JSON.stringify(newEnvironments));

  process.env = {
    ...process.env,
    ...newEnvironments,
  };
};

const reloadLogMode = async (logMode) => {
  try {
    if (process.env.DEVELOP_MODE === logMode || process.env.DEVELOP_MODE == '2') return;

    process.env = {
      ...process.env,
      DEVELOP_MODE: logMode || '0',
    };

    const loggerPath = '../util/logger.js';
    delete require.cache[require.resolve(loggerPath)];
    console.log('[reloadModule] Reloading logger.js...');

    return require(loggerPath);
  } catch (e) {
    console.log(`[reloadModule] Failed to reload logger.js - Error: ${e.message}`);
    await mailError({
      type: 'RUNTIME',
      message: e.message,
      stack: e.stack || e.message || e || 'No error stack',
    });
  }
};

const performOutreach = async ({
  CallflowId,
  PhoneNumber,
  CallerId,
  Language,
  CallerNumber,
  Attribute,
  OutreachType,
  serviceRequestTimeout,
}) => {
  let config = {
    method: 'POST',
    url: process.env.CALLFLOW_DOMAIN + '/system/Callflow/outreach/' + CallflowId,
    headers: {
      Authorization: 'Bearer ' + process.env.CALLFLOW_LOGIN_TOKEN,
    },
    data: {
      phoneNumber: PhoneNumber,
      callerId: CallerId,
      language: Language,
      callerNumber: CallerNumber,
      attribute: Attribute,
      outreachType: OutreachType,
      extendData: null,
    },
    timeout: (serviceRequestTimeout || 30) * 1000,
  };

  try {
    let resp = await axios(config);

    if (resp && resp.data && (resp.data.result == false || resp.data.result == 'false')) {
      return { result: false, error: null };
    }
    return { result: true };
  } catch (e) {
    return { result: false, error: e };
  }
};

const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));

const reload = async () => {
  // if (process.env.DEVELOP_MODE === '2') return;

  const data = await getCallFlowSetting(true);

  if (!data) {
    await sleep(3000);
    return reload();
  }

  updateENV(data);

  reloadLogMode(data.botLogMode);
};

reload();

module.exports = {
  getFlowWithId,
  getPrediction,
  getFlowWithPhoneNumber,
  recognizeChatGPT,
  qaChatGPT,
  addConversation,
  getContactMessageByUserID,
  agentReplied,
  getContact,
  getAMQP,
  getCallFlowSetting,
  GPTChatService,
  getChannel,
  CustomFunction,
  saveConversationState,
  getGrammarDetails,
  getFunctionDetails,
  sendMail,
  getGPTDirectory,
  postChatClientEndConversation,
  updateENV,
  reloadLogMode,
  getBuiltinFunction,
  callCMS,
  mapCMSData,
  callDataSet,
  performOutreach,
};
