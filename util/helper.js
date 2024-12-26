const moment = require('moment-timezone');
const traverse = require('traverse-v2');
const { CustomActivityTypes } = require('../classes/CustomActivityTypes');
const Image = require('./images');
const Video = require('./videos');
const { text } = require('body-parser');
const { PROVIDERS } = require('../constant');

/**
 *
 * @param {*} textJSON - JSON string from call flow
 * @param {*} lang - language
 * @returns text from JSON
 */
const extractText = (textJSON, lang, defaultLang = 'en') => {
  try {
    if (!textJSON || !textJSON.trim()) return { text: '', language: lang || 'en-US' };

    const json = JSON.parse(textJSON);

    if (!Array.isArray(json) && json.length == 0) return { text: '', language: lang || 'en-US' };

    let defaultLanguage = json.find((lg) => lg.language.includes(defaultLang.split('-')[0]));
    let defaultLanguagePrompt = {
      language: defaultLang || 'en-US',
      text: '',
    };

    //getting defaultLanguage
    let { textChatBot, text } = defaultLanguage || {};

    if (textChatBot && Array.isArray(textChatBot) && textChatBot.length > 0)
      defaultLanguagePrompt.text = textChatBot[Math.floor(Math.random() * textChatBot.length)];

    if (typeof textChatBot == 'string') defaultLanguagePrompt.text = textChatBot;

    if (!defaultLanguagePrompt.text) {
      if (Array.isArray(text) && text.length > 0) defaultLanguagePrompt.text = text[Math.floor(Math.random() * text.length)];

      if (typeof text == 'string') defaultLanguagePrompt.text = text;
    }

    //lang not existed
    if (!lang) return defaultLanguagePrompt;

    //else lang exists
    let translatedPrompt = json.find((e) => e.language.includes(lang));
    let { textChatBot: translatedTextChatBox, text: translatedText } = translatedPrompt || {};

    if (translatedTextChatBox && Array.isArray(translatedTextChatBox) && translatedTextChatBox.length)
      return {
        text: translatedTextChatBox[Math.floor(Math.random() * translatedTextChatBox.length)],
        language: lang,
      };

    if (typeof translatedTextChatBox == 'string' && translatedTextChatBox)
      return { text: translatedTextChatBox, language: lang };

    if (Array.isArray(translatedText) && translatedText.length)
      return {
        text: translatedText[Math.floor(Math.random() * translatedText.length)],
        language: lang,
      };

    if (translatedText && typeof translatedText == 'string') return { text: translatedText, language: lang };

    return defaultLanguagePrompt;
  } catch (err) {
    console.error(`[extractText] err: ${err.message}`);
    console.error(err.stack);
    return { text: '', language: 'en-US' };
  }
};

/**
 * Replace all {elements} in text with conversation data
 * @param {*} conversationData conversation data
 * @param {*} prompt text
 * @returns text
 */
const replaceStrWithParam = (conversationData, prompt) => {
  if (!conversationData || !prompt) return prompt || '';

  const regex = /{((len|upper|lower|substr|trim|replace|pos|add|sub|mul|div|count)\([^{}]*(\{[^{}]*\}[^{}]*)*\))}/g;

  prompt = prompt.toString().replace(/{([a-zA-Z0-9_ ]+(?:->[a-zA-Z0-9_ ]+)*)}/g, (match, path) => {
    const rs = getValueByPath(conversationData, path.trim());

    if (typeof rs === 'object') return JSON.stringify(rs);

    if (['number', 'boolean'].includes(typeof rs)) return rs.toString();

    return rs || '';
  });

  prompt = prompt.toString().replace(regex, (match, path) => {
    return handleCommonFunctions(conversationData, match);
  });

  if (regex.test(prompt) || /{([a-zA-Z0-9_ ]+(?:->[a-zA-Z0-9_ ]+)*)}/g.test(prompt)) {
    return replaceStrWithParam(conversationData, prompt);
  }

  return prompt;
};

/**
 * From string parameters the function will extract and return {}
 * @param {*} params - string parameters.
 * @returns Example : {name: "any", age: 13, address: "http://example.com"}
 */
const paramsExtract = (params) => {
  if (!params) return {};

  try {
    params = JSON.parse(params);
  } catch (e) {
    console.error('[paramsExtract] parse json failed : ', e.message);
    console.error(e.stack);
  }

  let data = {};

  if (!Array.isArray(params)) {
    console.log(`[paramsExtract] Expected params to be an array but got ${typeof params} => return`);
    return {};
  }

  params.forEach((element) => {
    const { name, value } = element;

    if (!name) return;

    data = {
      ...data,
      [name]: value,
    };
  });

  return data;
};

/**
 * Set new attributes from API response to conversation data
 * @param {*} promptData Conversation data
 * @param {*} attributes Attributes provided by the flow
 * @param {*} resp API response
 * @returns an object that contains Conversation data and attributes
 */
const setAttributes = (promptData, attributes, resp) => {
  if (!promptData || !attributes || !resp) return promptData;
  let results = promptData;

  Object.entries(attributes).forEach(([key, value]) => {
    if (key.includes('->')) {
      const keys = key.split('->');
      let currentResult = results;

      for (let i = 0; i < keys.length - 1; i++) {
        const currentKey = keys[i];
        currentResult[currentKey] = currentResult[currentKey] || {};
        currentResult = currentResult[currentKey];
      }

      currentResult[keys[keys.length - 1]] = value === '$raw$' ? resp : accessProp(value, resp);
    } else {
      results = {
        ...results,
        [key]: value == '$raw$' ? resp : accessProp(value, resp),
      };
    }
  });

  return { ...promptData, ...results };
};

const isPhoneNumber = (str) => {
  str = str.replace(/[+|(|)|.|-]|\s/g, '');
  var regex = /^\d{7,14}$/g;
  if (regex.test(str)) {
    return true;
  }
  return false;
};

const isDate = (str) => {
  if (!str) return false;

  const validateFormat = [
    'MM/DD/YYYY',
    'M/D/YYYY',
    'M/DD/YYYY',
    'MMM D YYYY',
    'MM-DD-YYYY',
    'M-D-YYYY',
    'YYYY-MM-DD',
    'l',
    'L',
    'll',
    'LL',
    'today',
    'yesterday',
    'tomorrow',
    'next day',
    'last day',
  ];

  str = str.toLowerCase();
  if (validateFormat.includes(str)) {
    switch (str) {
      case 'today':
        str = moment();
        break;
      case 'yesterday':
        str = moment().add(-1, 'days');
        break;
      case 'tomorrow':
        str = moment().add(1, 'days');
        break;
      case 'next day':
        str = moment().add(1, 'days');
        break;
      case 'last day':
        str = moment().add(-1, 'days');
        break;
      default:
        break;
    }
  }

  str = convertDateString(str);

  const isValid = moment(str, validateFormat, true).isValid();
  return (isValid && moment(str, validateFormat).format('MM-DD-YYYY')) || false;
};

const convertDateString = (str) => {
  const date = new Date(str);

  if (isNaN(date)) return str;

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${month}-${day}-${year}`;
};

/**
 * Find sub action in the flow
 * @param {*} json call flow json
 * @param {*} keyId SubAction key id
 * @returns Action json
 */
const findAction = (json, keyId) => {
  if (!json || !keyId) return;

  let action;

  traverse(json).forEach(function (x) {
    if (x != undefined && x.Key && x.Id != 'SubAction' && x.Key === keyId) {
      action = { [this.key]: { ...x } };
      return;
    }
  });

  return action;
};

/**
 * This function replaces placeholders in an object with their corresponding values from a conversationData object
 * @param {*} conversationData
 * @param {*} obj
 * @returns
 */
const replaceObjWithParam = (conversationData, obj) => {
  if (!conversationData) return obj;

  // Get all keys from the object as an array
  const arr = Object.keys(obj);

  // Loop through each key in the array
  for (let key of arr) {
    if (!isNaN(obj[key])) continue;
    if (typeof obj[key] === 'object') {
      obj[key] = replaceObjWithParam(conversationData, obj[key]);
      continue;
    }
    if (obj[key] && obj[key].match(/^{[\w->]+}$/)) {
      obj[key] = getValueByPath(conversationData, obj[key].replace(/{|}/g, ''));
    } else {
      obj[key] = replaceStrWithParam(conversationData, obj[key]);
    }
  }

  return obj;
};

const isSamePhoneNumber = (phone1, phone2) => {
  if (!phone1 || !phone2) return false;
  if (phone1 == phone2) return true;
  if (phone1.replace(/\D/g, '') == phone2.replace(/\D/g, '')) {
    return true;
  }

  if (phone1.length > phone2.length) {
    var subPhone = phone1.substr(-phone2.length);
    return subPhone == phone2;
  } else {
    var subPhone = phone2.substr(-phone1.length);
    return subPhone == phone1;
  }
};

const filterFlowWithPhoneNumber = (botPhoneNumber, callFlows) => {
  if (!botPhoneNumber || !callFlows) return;
  try {
    for (let flow of callFlows) {
      // if in flow have botContacts then splits all the contacts and compare the number
      if (flow.callSettings && flow.callSettings[0].botContact) {
        let phoneNumbers = parseJSONString(flow.callSettings[0].botContact);

        for (let phoneNumber of phoneNumbers) {
          // check every phone number in the list
          if (isSamePhoneNumber(phoneNumber.contactId, botPhoneNumber)) {
            return flow;
          }
        }
        // else doesn't have bot contact then continue loop
      }
    }
  } catch (e) {
    console.log(`[filterFlowWithPhoneNumber] Filter flow failed: ${e.message}, phone ${botPhoneNumber}`);
    console.error(`[filterFlowWithPhoneNumber] Filter flow failed: ${e.message}`);
    console.error(e.stack);
    return;
  }
};

const filterFlowWithFlowId = (flowId, callFlows) => {
  if (!flowId || (!callFlows && !callFlows.length)) return;
  return callFlows.find((flow) => flow.id == flowId);
};

const parseJSONString = (stringJson) => {
  if (!stringJson) return {};
  try {
    return JSON.parse(stringJson);
  } catch (e) {
    console.log(`[parseJSONString] parse JSON failed: ${e.message} - data: ${stringJson}`);
    console.error(`[parseJSONString] parse JSON failed: ${e.message} - data: ${stringJson}`);
    return {};
  }
};

const tryParseJSON = (string) => {
  try {
    return JSON.parse(string);
  } catch (e) {
    return {};
  }
};

const stringifyJSONString = (stringJson) => {
  if (!stringJson) return;
  try {
    return JSON.stringify(stringJson);
  } catch (e) {
    console.log(`[stringifyJSONString] stringify JSON failed: ${e.message}`);
    console.error(`[stringifyJSONString] stringify JSON failed: ${e.message}`);
    console.error(e.stack);
    return;
  }
};

const getChannelId = (flow, botPhoneNumber) => {
  if (!flow || !botPhoneNumber) {
    return;
  }
  if (flow.callSettings && flow.callSettings[0].botContact) {
    let phoneNumbers = parseJSONString(flow.callSettings[0].botContact);
    for (let phoneNumber of phoneNumbers) {
      // check every phone number in the list
      if (phoneNumber.provider && isSamePhoneNumber(phoneNumber.contactId, botPhoneNumber)) {
        return phoneNumber.provider;
      }
    }
  }
};

const formatPhoneNumber = (phoneNumber, channelId) => {
  if (getSMSChannels().includes(channelId))
    return (process.env.PHONE_NUMBER_COUNTRYCODE || '1') + phoneNumber.replace(/[^\d]/g, '');

  return phoneNumber;
};

const extractIntents = (grammar) => {
  if (!lang || !grammar || !Array.isArray(grammar)) return;
  let grammarWithLang = grammar.find((x) => x.code == lang);
  if (!grammarWithLang && !grammarWithLang.value && !Array.isArray(grammarWithLang.value)) return;
  return grammarWithLang.value.map((x) => x.intent);
};

/**
 * This function groups entities by their name and sorts them by accuracy (if not using GPT)
 * @param {*} entities
 * @param {*} isUsingGPT
 * @returns
 */
const getEntity = (entities, isUsingGPT = false) => {
  if (!entities || !Array.isArray(entities) || entities.length <= 0) return;

  if (isUsingGPT) {
    entities.forEach((entity) => (entity.sourceText = entity.Value || entity.value || entity.Text));
  }

  let result = groupBy(entities, 'entity');

  if (!isUsingGPT) {
    for (const key in result) {
      result[key].sort((a, b) => b.accuracy - a.accuracy);
    }
  }

  return result;
};

function groupBy(arr, key) {
  return arr.reduce((acc, obj) => {
    const name = obj[key];
    if (!acc[name]) {
      acc[name] = [];
    }
    acc[name].push(obj);
    return acc;
  }, {});
}

function handleCommonFunctions(conversationData, funcStr) {
  const pattern = /{(\w+)\(((?:[^{}]|{[^{}]*})*)\)}/g;
  const matches = [...funcStr.matchAll(pattern)];
  let result = funcStr;

  for (const match of matches) {
    const func = match[1];
    let args = match[2].split(',').length > 1 ? match[2].split(',') : match[2];

    try {
      switch (func) {
        case 'len':
          result = funcStr.replace(match[0], args.length);
          break;
        case 'upper':
          result = funcStr.replace(match[0], args.toUpperCase());
          break;
        case 'lower':
          result = funcStr.replace(match[0], args.toLowerCase());
          break;
        case 'substr':
          const subStr = args.length === 3 ? args[0].substring(parseFloat(args[1]), parseFloat(args[2])) : '';
          result = funcStr.replace(match[0], subStr);
          break;
        case 'trim':
          result = funcStr.replace(match[0], args.trim());
          break;
        case 'count':
          const arr = JSON.parse(match[2]);
          if (!Array.isArray(arr)) {
            result = funcStr.replace(match[0], '0');
          } else {
            result = funcStr.replace(match[0], arr.length);
          }
          break;
        case 'replace':
          let arg1 = args[1];
          arg1 = arg1.replace(/[~`!@#$%^&*()_\-+={[}\]|\\:;"'<,>.?/]/g, '\\$&');
          let rpl = args[1] && args.length === 3 ? args[0].replace(new RegExp(arg1, 'g'), args[2]) : '';
          result = funcStr.replace(match[0], rpl);
          break;
        case 'pos':
          const pos = args.length === 2 ? args[0].indexOf(args[1]) : -1;
          result = funcStr.replace(match[0], pos);
          break;
        case 'add':
          const add = args.length === 2 ? parseFloat(args[0]) + parseFloat(args[1]) : '';
          result = funcStr.replace(match[0], add);
          break;
        case 'sub':
          const sub = args.length === 2 ? parseFloat(args[0]) - parseFloat(args[1]) : '';
          result = funcStr.replace(match[0], sub);
          break;
        case 'mul':
          const mul = args.length === 2 ? parseFloat(args[0]) * parseFloat(args[1]) : '';
          result = funcStr.replace(match[0], mul);
          break;
        case 'div':
          if (args.length === 2 && parseFloat(args[1]) !== 0) {
            let div = parseFloat(args[0]) / parseFloat(args[1]);
            result = funcStr.replace(match[0], div);
          } else {
            result = funcStr.replace(match[0], 'Error: Division by zero');
          }
          break;
        default:
          result = '';
          break;
      }
    } catch (e) {
      console.error(`Error processing function ${func}: ${e.message}`);
      result = funcStr.replace(match[0], '');
    }

    funcStr = result;
  }

  return result;
}

function getValueByPath(obj, path) {
  const keys = path.split('->');
  let result = obj;

  for (let i = 0; i < keys.length; i++) {
    result = result[keys[i]];

    if (!result && result != 0) return result;
  }

  return result;
}

function updateObjWithParams(obj, params) {
  if (!obj || !params) return obj;

  let newObj = obj;

  Object.entries(params).forEach(([key, value]) => {
    let newValue;

    if (value && value.match(/^{[\w->]+}$/)) {
      newValue = getValueByPath(obj, value.replace(/{|}/g, ''));
    } else {
      newValue = replaceStrWithParam(obj, value);
    }

    if (key.includes('->')) {
      const keys = key.split('->');
      let currentResult = newObj;

      for (let i = 0; i < keys.length - 1; i++) {
        const currentKey = keys[i];
        currentResult[currentKey] = currentResult[currentKey] || {};
        currentResult = currentResult[currentKey];
      }

      currentResult[keys[keys.length - 1]] = newValue;
    } else {
      newObj = {
        ...newObj,
        [key]: newValue,
      };
    }
  });

  return { ...obj, ...newObj };
}

function InitDataSubFlow(oldData, newData, params) {
  if (!newData || !params) return oldData;

  let result = newData;

  Object.entries(params).forEach(([key, value]) => {
    let newValue;

    if (value && value.match(/^{[\w->]+}$/)) {
      newValue = getValueByPath(oldData, value.replace(/{|}/g, ''));
    } else {
      newValue = replaceStrWithParam(oldData, value);
    }

    if (key.includes('->')) {
      const keys = key.split('->');
      let currentResult = result;

      for (let i = 0; i < keys.length - 1; i++) {
        const currentKey = keys[i];
        currentResult[currentKey] = currentResult[currentKey] || {};
        currentResult = currentResult[currentKey];
      }

      currentResult[keys[keys.length - 1]] = newValue;
    } else {
      result = {
        ...result,
        [key]: newValue,
      };
    }
  });

  return { ...newData, ...result };
}

function extractParams(conversationData, params) {
  if (!params) return {};

  const pairs = params.split('|');
  const result = {};
  const regex = /^({[^}]+})*$/g;

  pairs.forEach((pair) => {
    const [key, value] = pair.split('=');
    let path;
    if (regex.test(value)) {
      path = getValueByPath(conversationData, value.replace(/{|}/g, ''));
    } else {
      path = value.replace(/{([^}]+)}/g, (match, path) => getValueByPath(conversationData, path));
    }

    result[key] = path;
  });

  return result;
}

const getSMSChannels = () => {
  return ['VIB', 'WHA', 'RIN', 'TWI', 'ZIP', 'QBL', '382', 'SMF', 'SOL'];
};

const getPhoneNumber = (phone) => {
  if (!phone) return '';
  if (phone.indexOf('00') === 0) {
    return '';
  }
  phone += '';
  const channels = getSMSChannels();
  //get phone from special format
  if (phone.split('-').length == 2 && channels.find((c) => phone.startsWith(c))) {
    phone = phone.split('-')[0];
    for (let str of channels) {
      if (phone.startsWith(str)) {
        phone = phone.replace(str, '');
        break;
      }
    }
  }

  phone = phone.replace(/[+|(|)|.|-]|\s/g, '');
  var regex = /^\d{7,14}$/g;
  if (regex.test(phone)) {
    return phone;
  }
  return '';
};

const getCallerID = (str) => {
  let callerId = '';
  const channels = getSMSChannels();
  if (str.split('-').length == 2 && channels.find((c) => str.startsWith(c))) {
    callerId = str.split('-')[1];
  }
  callerId = callerId.replace(/[+|(|)|.|-]|\s/g, '');
  var regex = /^\d{7,14}$/g;
  if (regex.test(callerId)) {
    return callerId;
  }
  return '';
};

const getUserID = (fromID) => {
  if (!fromID) return '';

  let phone = fromID.split('-')[0];

  for (let prov of PROVIDERS) {
    if (phone.startsWith(prov.id)) return phone.replace(prov.id, '');
  }

  return phone;
};

const getJSONFromRabbitMQ = (msg) => {
  let result = {};
  if (msg) {
    const params = msg.replace(/\$P\$/g, '$V$').split('$V$');
    for (let idx in params) {
      if (idx % 2 == 0) {
        result[params[idx]] = params[+idx + 1];
      }
    }
  }
  return result;
};

/**
 * replace \n at the end or start of the string
 * @param {String} str
 */
const trimStr = (str) => {
  return str && str.replace(/^\n+|\n+$/g, '').trim();
};

const accessProp = (path, object) => {
  return path.split('->').reduce((o, i) => o[i], object);
};

const mapDefaultValue = (jsString) => {
  if (!jsString) return { attributes: {}, env: {} };

  let attributes = {};
  let env = {};

  try {
    let data = jsString;
    if (typeof jsString === 'string') {
      data = JSON.parse(jsString);
    }

    if (!Array.isArray(data)) return { attributes: {}, env: {} };

    data.forEach((e) => {
      if (e.default == '2') {
        env = { ...env, [e.value]: e.content || '' };
      }
      attributes = { ...attributes, [e.value]: e.content || '' };
    });
  } catch (err) {
    console.log(`[mapDefaultValue] Could not map attributes : ${err.message} - Data : ${jsString}`);
    return { attributes, env };
  }

  return { attributes, env };
};

const isFalse = (value) => {
  if (!value) return true;

  const falsies = ['undefined', 'False', 'false', 'null', '', undefined, null];

  if (falsies.includes(value)) return true;
  return false;
};

const isNotUnderstand = (prompt) => {
  return [
    `couldn't understand your`,
    `i couldn't understand`,
    `i didn't understand that`,
    `do not understand`,
    `rephrase your question and try again`,
    `didn't understand your question`,
    `not understand your question`,
    `don't understand your question`,
    `i don't understand`,
    `please provide more information`,
    `i'm sorry, but the context`,
    `there is no information provided`,
    `please provide more details`,
    `can you provide more details`,
    `we don't understand`,
    `i couldn't find any relevant information`,
    `i couldn't find any information`,
    `can you provide more information`,
    `i need more specific information`,
    `i need more detailed information`,
  ].some((e) => prompt && prompt.toLowerCase().includes(e));
};

function assignValueToObject(obj, attribute, value) {
  if (!obj || !attribute) return obj;
  const keys = attribute.split('->');
  let currentObj = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!currentObj.hasOwnProperty(key) || typeof currentObj[key] !== 'object') {
      currentObj[key] = {};
    }
    currentObj = currentObj[key];
  }

  const lastKey = keys[keys.length - 1];
  currentObj[lastKey] = value;
}

const formatMessage = (data) => {
  let { channelId, message: msg, mediaSetting, mediaName, lang, allowSpeak, buttons, AllowAnswerOption } = data;

  let message = msg.toString();

  // video bot
  let channelData = {
    lang,
  };

  if (!message || !message.trim()) {
    return {
      type: CustomActivityTypes.Message,
      text: '',
      channelData,
    };
  }

  // if (!isFalse(AllowAnswerOption) && Array.isArray(buttons)) {
  //   // handle buttons
  //   channelData.type = 'button';
  //   // channelData.buttons = await getButtons(Answer, lang);
  //   channelData.buttons = buttons;
  // }

  if (channelId && channelId.toLowerCase() === 'vdb') {
    channelData = {
      ...channelData,
      ...(mediaSetting.find((media) => media.name == mediaName) || {}),
    };
    channelData.allowSpeak = allowSpeak;

    return {
      type: CustomActivityTypes.Message,
      text: message,
      channelData,
    };
  }

  return {
    type: CustomActivityTypes.Message,
    text: message,
    channelData,
  };
};

const formatMultipleMessage = (data) => {
  let { channelId, message: msg, mediaSetting, mediaName, lang, allowSpeak } = data;

  if (msg.type == 'image') {
    let image = new Image(msg.value, channelId);
    return image.formatImage();
  }

  if (msg.type == 'video') {
    let video = new Video(msg.value, channelId);
    return video.formatVideo();
  }

  let message = msg.type == 'text' ? msg.value && msg.value.toString().trim() : msg.toString();

  if (!message) return;

  // video bot
  let channelData = {
    lang,
  };

  if (channelId && channelId.toLowerCase() === 'vdb') {
    contentData.channelData = {
      ...contentData.channelData,
      ...(mediaSetting.find((media) => media.name == mediaName) || {}),
    };
    channelData.allowSpeak = allowSpeak;
  }

  return {
    type: CustomActivityTypes.Message,
    text: message,
    channelData,
  };
};

const checkExitInObj = (path, data) => {
  if (!path || !data) return false;

  const keys = path.split('->');
  let val = data;

  for (let i = 0; i < keys.length - 1; i++) {
    val = val[keys[i]];

    if (!val) return false;
  }

  return keys[keys.length - 1] in val;
};

function checkCase({ Case, Attribute, ConversationData, ValueCheckNextCase }) {
  if (!Case || !Case.CaseOption || !ConversationData || (!Attribute && !ValueCheckNextCase)) return false;

  let condition = Case.CaseOption.split(':');
  let comparation = condition[0];
  let checkAttribute = replaceStrWithParam(ConversationData, condition[1]);
  let checkData =
    ValueCheckNextCase ||
    (Attribute.includes('->') ? getValueByPath(ConversationData, Attribute) : ConversationData[Attribute]);

  Case = {
    ...Case,
    BOT_ATTRIBUTE_CHECK: checkAttribute,
    BOT_DATA_CHECK: checkData,
    BOT_COMPARE: comparation,
  };

  // compare number case
  if (!isNaN(checkData)) {
    if (
      (comparation === 'Equal' && parseFloat(checkData) === parseFloat(checkAttribute)) ||
      (comparation === 'Not equal' && parseFloat(checkData) != parseFloat(checkAttribute)) ||
      (comparation === 'Is less than' && parseFloat(checkData) < parseFloat(checkAttribute)) ||
      (comparation === 'Is less than or equal' && parseFloat(checkData) <= parseFloat(checkAttribute)) ||
      (comparation === 'Is greater than' && parseFloat(checkData) > parseFloat(checkAttribute)) ||
      (comparation === 'Is greater than or equal' && parseFloat(checkData) >= parseFloat(checkAttribute))
    ) {
      return Case;
    }
  }

  // true false
  if (
    checkData &&
    typeof checkData === 'boolean' &&
    comparation === 'Equal' &&
    Boolean(checkAttribute.toLowerCase()) &&
    checkData === (checkAttribute.toLowerCase() === 'true')
  ) {
    return Case;
  }

  // normal text or number
  if ((checkData && typeof checkData === 'string') || checkData instanceof String || typeof checkData === 'number') {
    if (
      (comparation === 'Starts with' &&
        checkData.toString().toLocaleLowerCase().trim().startsWith(checkAttribute.toLocaleLowerCase().trim())) ||
      (comparation === 'Ends with' &&
        checkData.toString().toLocaleLowerCase().trim().endsWith(checkAttribute.toLocaleLowerCase().trim())) ||
      (comparation === 'Contains' &&
        checkData.toString().toLocaleLowerCase().trim().includes(checkAttribute.toLocaleLowerCase().trim())) ||
      (comparation === 'Equal' &&
        checkData.toString().toLocaleLowerCase().trim() == checkAttribute.toLocaleLowerCase().trim()) ||
      (comparation === 'Not equal' &&
        checkData.toString().toLocaleLowerCase().trim() != checkAttribute.toLocaleLowerCase().trim())
    ) {
      return Case;
    }
  }

  if (comparation === 'Empty') {
    // array
    if (
      (checkAttribute === 'true' && Array.isArray(checkData) && !checkData.length) ||
      (checkAttribute === 'false' && Array.isArray(checkData) && checkData.length)
    ) {
      return Case;
    }

    //object
    if (checkData && typeof checkData == 'object') {
      if (
        (checkAttribute === 'true' && Object.keys(checkData).length == 0) ||
        (checkAttribute === 'false' && Object.keys(checkData).length > 0)
      ) {
        return Case;
      }
    }

    // string
    if (typeof checkData == 'string') {
      if (
        (checkAttribute == 'true' && (checkData == '' || checkData == 'null' || checkData == 'undefined')) ||
        (checkAttribute == 'false' && checkData.length && checkData != 'null' && checkData != 'undefined')
      ) {
        return Case;
      }
    }

    if (
      (checkAttribute === 'true' && ((!checkData && checkData !== 0) || checkData == 'null' || checkData == 'undefined')) ||
      (checkAttribute === 'false' && (checkData || checkData === 0) && checkData != 'null' && checkData != 'undefined')
    ) {
      return Case;
    }
  }

  if (comparation === 'Exist') {
    if (checkAttribute === 'true' && checkExitInObj(Attribute, ConversationData)) {
      return Case;
    }
    if (checkAttribute === 'false' && !checkExitInObj(Attribute, ConversationData)) {
      return Case;
    }
  }

  //handle undefined, null, != type for Not equal
  if (checkAttribute && comparation == 'Not equal' && (!checkData || typeof checkData != 'string')) {
    return Case;
  }

  if (comparation === 'Equal' && (checkData == checkAttribute || String(checkData) === checkAttribute)) {
    return Case;
  }

  return false;
}

function assignSubflowOutput(OutputOption, subflowdata, mainData) {
  if (!OutputOption || !subflowdata) return mainData;

  let result = {};

  let temp = {};

  try {
    temp = JSON.parse(OutputOption);
  } catch (err) {
    console.log('[assignSubflowOutput] parsed JSON failed ' + err.message);
    console.error('[assignSubflowOutput] parsed JSON failed ' + err.message);
    console.error(err.stack);
  }

  if (!temp || (Array.isArray(temp) && !temp.length)) {
    return mainData;
  }

  for (const item of temp) {
    const { value, name } = item;
    if (subflowdata.hasOwnProperty(value) && mainData.hasOwnProperty(name)) {
      result[name] = subflowdata[value];
    }
  }

  return { ...mainData, ...result };
}

function detectChangedValues(originalObj = {}, modifiedObj = {}) {
  const result = {};

  for (const key in modifiedObj) {
    if (originalObj && originalObj.hasOwnProperty(key)) {
      if (typeof originalObj[key] === 'object' && typeof modifiedObj[key] === 'object') {
        // Recursively check nested objects
        const nestedChanges = detectChangedValues(originalObj[key], modifiedObj[key]);
        if (Object.keys(nestedChanges).length > 0) {
          result[key] = nestedChanges;
        }
      } else if (originalObj[key] !== modifiedObj[key]) {
        result[key] = modifiedObj[key];
      }
    } else {
      result[key] = modifiedObj[key];
    }
  }

  return result;
}

const endConversation = async (step, message, inHook) => {
  if (message) await step.context.sendActivity(message);
  //if (step.parent && typeof step.parent.cancelAllDialogs == 'function') await step.parent.cancelAllDialogs();
  if (typeof step.cancelAllDialogs == 'function') await step.cancelAllDialogs(true);

  if (step.context.activity.name != 'endConversation' && step.context.activity.channelId === 'WEB' && !inHook) {
    await step.context.sendActivity({
      type: 'endOfConversation',
    });
  }

  return await step.endDialog();
};

const checkDigit = (pattern, digit) => {
  if (!pattern) return false;

  // Create a regular expression from the pattern
  pattern = pattern.replace(/X/g, '\\d').replace(/Z/g, '[1-9]').replace(/N/g, '[2-9]');
  const regex = new RegExp(`^${pattern.replace(/!/g, '')}` + `${pattern.endsWith('.') || pattern.endsWith('!') ? '' : '$'}`);

  // Test the digit against the regular expression
  return regex.test(digit.toString());
};

const isEmail = (string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(string) ? string : false;
};

const contentTraceLogMultipleMessages = (messages) => {
  if (!Array.isArray(messages) || !messages.length) return '';
  let result = '';
  let count = 1;
  messages.forEach((msg) => {
    if (!msg.value) return;
    result += `|${count++}: ${msg.value}`;
  });

  return result || '';
};

const formatEntitiesLog = (entities) => {
  if (!entities || typeof entities != 'object' || !Object.keys(entities).length) return '';

  let result = '';

  Object.entries(entities).map(([key, value]) => {
    result += `|- ${key}: ${value.map((e) => "'" + e.sourceText + "'").join(', ')}`;
  });

  return result;
};

const formatErrorLogStr = (action, code, message) => {
  let result = '';
  result += (action && `Action Name: ${action}| `) || ``;
  result += `Error Code: ${code}| Error Message: ${message}`;

  return result;
};

const checkCondition = ({ checkVal, value, condition, data, name }) => {
  if (condition === 'Equal' && (checkVal == value || String(checkVal) == String(value))) {
    return true;
  }

  if (condition === 'Exist') {
    if (value === 'true' && checkExitInObj(name, data)) {
      return true;
    }
    if (value === 'false' && !checkExitInObj(name, data)) {
      return true;
    }
  }

  // special check for number type
  if (!isNaN(parseFloat(checkVal))) {
    if (
      (condition === 'Equal' && parseFloat(checkVal) === parseFloat(value)) ||
      (condition === 'Not equal' && parseFloat(checkVal) != parseFloat(value)) ||
      (condition === 'Is less than' && parseFloat(checkVal) < parseFloat(value)) ||
      (condition === 'Is less than or equal' && parseFloat(checkVal) <= parseFloat(value)) ||
      (condition === 'Is greater than' && parseFloat(checkVal) > parseFloat(value)) ||
      (condition === 'Is greater than or equal' && parseFloat(checkVal) >= parseFloat(value))
    ) {
      return true;
    }
  }

  // special check for normal text or number
  if ((checkVal && typeof checkVal === 'string') || checkVal instanceof String || typeof checkVal === 'number') {
    if (
      (condition === 'Starts with' && checkVal.toString().toLowerCase().trim().startsWith(value.toLowerCase().trim())) ||
      (condition === 'Ends with' && checkVal.toString().toLowerCase().trim().endsWith(value.toLowerCase().trim())) ||
      (condition === 'Contains' && checkVal.toString().toLowerCase().trim().includes(value.toLowerCase().trim())) ||
      (condition === 'Equal' && checkVal.toString().toLowerCase().trim() == value.toLowerCase().trim()) ||
      (condition === 'Not equal' && checkVal.toString().toLowerCase().trim() != value.toLowerCase().trim())
    ) {
      return true;
    }
  }

  if (condition === 'Empty') {
    // array
    if (
      (value === 'true' && Array.isArray(checkVal) && !checkVal.length) ||
      (value === 'false' && Array.isArray(checkVal) && checkVal.length)
    ) {
      return true;
    }

    //object
    if (checkVal && typeof checkVal == 'object') {
      if (
        (value === 'true' && Object.keys(checkVal).length == 0) ||
        (value === 'false' && Object.keys(checkVal).length > 0)
      ) {
        return true;
      }
    }

    // string
    if (typeof checkVal == 'string') {
      if (
        (value == 'true' && (checkVal == '' || checkVal == 'null' || checkVal == 'undefined')) ||
        (value == 'false' && checkVal.length && checkVal != 'null' && checkVal != 'undefined')
      ) {
        return true;
      }
    }

    if (
      (value == 'true' && ((!checkVal && checkVal !== 0) || checkVal == 'null' || checkVal == 'undefined')) ||
      (value === 'false' && (checkVal || checkVal === 0) && checkVal != 'null' && checkVal != 'undefined')
    ) {
      return true;
    }
  }

  //handle undefined, null, != type for Not equal
  if (value && condition == 'Not equal' && (!checkVal || typeof checkVal != 'string')) {
    return true;
  }

  return false;
};

const handleSubflowConversationData = (conversationData, i) => {
  if (!conversationData) return;
  const {
    CUSTOM_DATA,
    CHANNEL_DATA,
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
    LANGUAGE,
  } = conversationData.data;

  for (let j = 0; j <= i - 1; j++) {
    conversationData.data = {
      ...assignSubflowOutput(
        conversationData.flowData.outputSubFlowData[j],
        conversationData.data,
        conversationData.flowData.flowsConversationData[j]
      ),
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
      ...conversationData.env,
    };
    conversationData.flowData.flowsConversationData = conversationData.flowData.flowsConversationData.slice(j);
    conversationData.flowData.outputSubFlowData = conversationData.flowData.outputSubFlowData.slice(j);
  }
};

module.exports = {
  assignSubflowOutput,
  formatPhoneNumber,
  extractText,
  paramsExtract,
  setAttributes,
  isPhoneNumber,
  isDate,
  findAction,
  replaceStrWithParam,
  replaceObjWithParam,
  isSamePhoneNumber,
  filterFlowWithPhoneNumber,
  parseJSONString,
  tryParseJSON,
  filterFlowWithFlowId,
  getChannelId,
  stringifyJSONString,
  extractIntents,
  getEntity,
  getValueByPath,
  updateObjWithParams,
  extractParams,
  getPhoneNumber,
  getSMSChannels,
  getJSONFromRabbitMQ,
  trimStr,
  mapDefaultValue,
  isFalse,
  isNotUnderstand,
  assignValueToObject,
  formatMessage,
  formatMultipleMessage,
  checkCase,
  InitDataSubFlow,
  detectChangedValues,
  endConversation,
  checkDigit,
  getCallerID,
  getUserID,
  isEmail,
  contentTraceLogMultipleMessages,
  formatEntitiesLog,
  formatErrorLogStr,
  checkCondition,
  handleSubflowConversationData,
};
