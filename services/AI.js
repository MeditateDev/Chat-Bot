const { default: axios } = require('axios');
const { CHATGPT_HEADERS, CALL_FLOW_HEADERS, ERROR_CODES } = require('../constant');
const { mailError } = require('./sendmail');
const { errorLog } = require('./callflowLog');
const { CustomError } = require('../classes/CustomError');

const getDataset = async (id, timeout = 30) => {
  let config = {
    method: 'GET',
    url: process.env.CALLFLOW_DOMAIN + '/system/ChatGPT/' + id,
    headers: CALL_FLOW_HEADERS(),
    timeout: timeout * 1000,
  };

  try {
    const { data } = await axios(config);

    return data || {};
  } catch (e) {
    console.error(`getDataset - Call API failed: ${e.message}`);

    await mailError({
      type: 'API',
      url: config.url,
      message: e.message,
      request: {},
      response: e.response && e.response.data,
      statusCode: e.response && e.response.status,
    });

    throw new CustomError(
      `[getDataset] Get GPT directory failed - Directory id: ${id} - Error : ${e.message}`,
      ERROR_CODES.GPT_DIRECTORY_FAILED,
      `Call API get directory failed: ${e.message}. Status code: ${e.response && e.response.status}`
    );
  }
};

const gptLLM = async ({
  Model = 'gpt-4o-mini',
  Text,
  TopP = 1,
  Temperature = 0.3,
  Prompt,
  NumberOutput = 512,
  FrequencyPenalty = 0,
  PresencePenalty = 0,
  ResponseFormat = 'text',
  timeout = 30,
}) => {
  const config = {
    method: 'POST',
    url: process.env.CHATGPT_SERVICE_URL + `/api/completions`,
    headers: CHATGPT_HEADERS(),
    data: {
      model: Model,
      input: Text,
      temperature: Temperature || 0.3,
      prompt: Prompt || '',
      num_output: NumberOutput,
      max_tokens: NumberOutput,
      frequency_penalty: FrequencyPenalty,
      presence_penalty: PresencePenalty,
      response_format: ResponseFormat,
      api_key: process.env.CHATGPT_API_KEY,
      top_p: TopP,
    },
    timeout: timeout * 1000,
  };

  try {
    console.log('gptLLM configs: ' + JSON.stringify(config));
    const { data } = await axios(config);
    console.log(`gptLLM response: ${JSON.stringify(data)}`);

    if (!data.success) {
      let err = new Error(`gptLLM return invalid data`);
      err.response = {
        data: data,
        status: 200,
      };
      throw err;
    }

    return { result: data && data.data };
  } catch (e) {
    console.error(`gptLLM - Call API failed: ${e.message}`);
    if (e.response) console.error(`gptLLM - Response : ${JSON.stringify(e.response.data)}`);

    await mailError({
      type: 'API',
      url: config.url,
      message: e.message,
      request: config.data,
      response: e.response && e.response.data,
      statusCode: e.response && e.response.status,
    });

    return { error: e };
  }
};

const geminiLLM = async ({ Text, Temperature, Prompt, timeout = 30 }) => {
  const config = {
    method: 'POST',
    url: process.env.CALLFLOW_DOMAIN + `/system/ChatGPT/llm`,
    headers: CALL_FLOW_HEADERS(),
    data: {
      model: 'gemini',
      input: Text,
      temperature: Temperature || 0.3,
      prompt: Prompt || '',
    },
    timeout: timeout * 1000,
  };

  try {
    console.log('geminiLLM configs: ' + JSON.stringify(config));

    const { data } = await axios(config);

    console.log(`geminiLLM response: ${JSON.stringify(data)}`);

    return { result: data };
  } catch (e) {
    console.error(`geminiLLM - Call API failed: ${e.message}`);
    if (e.response) console.error(`geminiLLM - Response : ${JSON.stringify(e.response.data)}`);

    await mailError({
      type: 'API',
      url: config.url,
      message: e.message,
      request: config.data,
      response: e.response && e.response.data,
      statusCode: e.response && e.response.status,
    });

    return { error: e };
  }
};

const knowledgeBase = async (data, type, timeout = 30) => {
  let config = {
    method: 'POST',
    url: process.env.CHATGPT_SERVICE_URL + (type === 'URL' ? `/api/page-reader` : `/api/docs-reader`),
    data: {
      ...data,
      api_key: process.env.CHATGPT_API_KEY,
    },
    headers: CHATGPT_HEADERS(),
    timeout: timeout * 1000,
  };

  try {
    console.log(JSON.stringify(config));
    let { data } = await axios(config);
    console.log(`[knowledgeBase] Response : ${JSON.stringify(data)}`);
    return data;
  } catch (err) {
    console.log(`[knowledgeBase] Call API to recognize with ChatGPT failed : ` + err.message);

    await mailError({
      type: 'API',
      url: config.url,
      message: err.message,
      request: config.data,
      response: err.response && err.response.data,
      statusCode: err.response && err.response.status,
    });

    errorLog({ config, err }, 'Check CHATGPT_SERVICE_URL, CHATGPT_API_KEY, CHATGPT_AUTHORIZATION_TOKEN');
  }
};

const gptConversation = async (data, timeout = 30) => {
  let config = {
    method: 'POST',
    url: process.env.CHATGPT_SERVICE_URL + '/api/conversation',
    data: {
      ...data,
      api_key: process.env.CHATGPT_API_KEY,
    },
    headers: CHATGPT_HEADERS(),
    timeout: timeout * 1000,
  };

  try {
    console.log(JSON.stringify(config));
    let { data } = await axios(config);
    console.log(`[gptConversation] Response : ${JSON.stringify(data)}`);
    return data;
  } catch (err) {
    console.log('[gptConversation] Call API to GPT error : ' + err.message);

    await mailError({
      type: 'API',
      url: config.url,
      request: config.data,
      message: err.message,
      response: err.response && err.response.data,
      statusCode: err.response && err.response.status,
    });

    errorLog({ config, err }, 'Check CHATGPT_SERVICE_URL, CHATGPT_API_KEY, CHATGPT_AUTHORIZATION_TOKEN');
  }
};

const queryKnowledge = async (data, timeout = 30) => {
  let config = {
    method: 'POST',
    url: process.env.CHATGPT_SERVICE_URL + '/api/rag/query',
    data: {
      ...data,
      api_key: process.env.CHATGPT_API_KEY,
    },
    headers: CHATGPT_HEADERS(),
    timeout: timeout * 1000,
  };

  try {
    console.log(JSON.stringify(config));
    let { data } = await axios(config);
    console.log(`[queryKnowledge] Response : ${JSON.stringify(data)}`);
    return data;
  } catch (err) {
    console.log(`[queryKnowledge] Call API queryKnowledge failed : ` + err.message);

    await mailError({
      type: 'API',
      url: config.url,
      message: err.message,
      request: config.data,
      response: err.response && err.response.data,
      statusCode: err.response && err.response.status,
    });

    errorLog({ config, err }, 'Check CHATGPT_SERVICE_URL, CHATGPT_API_KEY, CHATGPT_AUTHORIZATION_TOKEN');
  }
};

module.exports = { gptLLM, geminiLLM, knowledgeBase, gptConversation, queryKnowledge, getDataset };
