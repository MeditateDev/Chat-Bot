const { default: axios } = require('axios');
const { CALL_FLOW_HEADERS, ERROR_CODES } = require('../constant');
const { CustomError } = require('../classes/CustomError');

function replaceAttributeAndPush(str, regex, arr) {
  let index = 0;

  // escape characters
  str = str.replace(/\\\|/g, (match) => {
    arr.push(match.replace(/\\/g, ''));
    return `{${index++}}`;
  });

  // normal case
  return str.replace(regex, (match) => {
    arr.push(match.replace(/\|/g, ''));
    return `{${index++}}`;
  });
}

function replaceAllAttribute(str, replacements) {
  let regex = /\{(\d+)\}/g;
  let newStr = str;

  const matches = [...str.matchAll(regex)];

  matches.forEach((match, i) => {
    try {
      newStr = newStr.replace(match[0], replacements[match[1]] || '');
    } catch (e) {}
  });

  return newStr;
}

const callflowTranslate = async (text, fromLang, toLang, service, timeout = 30) => {
  if (!text || fromLang == toLang) return text;

  let config = {
    url: `${process.env.CALLFLOW_DOMAIN}/system/Translate`,
    method: 'post',
    headers: CALL_FLOW_HEADERS(),
    timeout: timeout * 1000,
    data: {
      service: service || 0,
      sourceLanguage: fromLang || '',
      targetLanguage: toLang,
      text,
    },
  };

  try {
    let { data } = await axios(config);

    if (typeof data === 'object') data = JSON.stringify(data);

    console.log(`[CallFlowTranslate] Translated "${text}" from ${fromLang} to ${toLang} result : ${data}`);

    return data;
  } catch (e) {
    console.log(
      `[CallFlowTranslate] Call API translate failed error: ${e.message} - Response: ${JSON.stringify(
        e.response && e.response.data
      )}`
    );

    throw new CustomError(
      `Call API translate failed error: ${e.message}`,
      ERROR_CODES.TRANSLATE_FAILED,
      `Call API translate failed error: ${e.message} - StatusCode: ${e.response && e.response.status}`
    );
  }
};

const translate = async (text, fromLang, toLang, service, timeout = 30) => {
  if (!text) return text;

  const fromLangCode = fromLang && fromLang.split('-')[0];
  const toLangCode = toLang && toLang.split('-')[0];

  // const regex = /(?:\{([^}]+)\}|\|([^|]+)\|)/g;
  // const regex = /\|{1,2}([^|]+)\|{1,2}/g;
  const regex = /(?:\|\|(.*?)\|\||\|(.*?)\|)/g;
  const arr = [];

  // replace all {element} in text to {1}, {2},...
  // and put it in the array arr

  const replacedText = replaceAttributeAndPush(text, regex, arr);

  if (fromLangCode == toLangCode || !toLangCode) return replaceAllAttribute(replacedText, arr);

  let result = await callflowTranslate(replacedText, fromLangCode, toLangCode, service, timeout);

  if (typeof result !== 'string') {
    result = result.toString();
  }

  return replaceAllAttribute(result, arr);
};

module.exports = translate;
