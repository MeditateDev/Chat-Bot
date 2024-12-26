const { getEntity, tryParseJSON, checkDigit, isFalse, replaceStrWithParam } = require('../util/helper');
const {
  getGrammarDetails,
  getFunctionDetails,
  CustomFunction,
  getPrediction,
  recognizeChatGPT,
  getBuiltinFunction,
} = require('./service');
const { gptLLM, geminiLLM } = require('./AI');
const translate = require('./translate');
const moment = require('moment-timezone');
const { ERROR_CODES } = require('../constant');

const LLM = async ({ Text, Prompt, Model, NumberOutput, FrequencyPenalty, PresencePenalty, ResponseFormat, timeout }) => {
  if (Model === 'gemini') {
    return await geminiLLM({ Text, Prompt, timeout });
  }

  return await gptLLM({ Text, Prompt, NumberOutput, FrequencyPenalty, PresencePenalty, ResponseFormat, timeout });
};

const isThisLanguageTrained = ({ pattern, language }) => {
  if (!language || !pattern || !Array.isArray(pattern) || !pattern.length) return false;

  const { value } = pattern.find((e) => e.code === language.split('-')[0]) || {};

  if (!value || !Array.isArray(value) || !value.length) return false;

  let result = false;

  value.forEach((e) => {
    if (e.intent) {
      result = true;
      return;
    }
  });

  return result;
};

const checkBuiltIn = async ({ ur, type, translateUR, timeout = 30, service }) => {
  const { id, code, codeFormat, companyId, name, param } = await getBuiltinFunction(type, timeout);

  if (translateUR && (name === 'biYesno' || name === 'biDate')) {
    ur = await translate(ur, '', 'en', service, timeout);
  }

  try {
    let { result, error } = await CustomFunction({
      FunctionId: id,
      FunctionName: name,
      CompanyId: companyId,
      Code: code,
      FormattedCode: codeFormat,
      CodeLanguage: '',
      Params: { [param || 'userInput']: ur },
      ConversationData: {},
      timeout,
    });

    if (error) throw error;

    return result;
  } catch (e) {
    e.ERROR_CODE = ERROR_CODES.FUNCTION_FAILED;
    e.ERROR_MESSAGE = `Call Service Custom Function - Id ${id} failed: ${e.message}. StatusCode ${
      e.response && e.response.status
    }`;
    throw e;
  }
};

const checkDigitPattern = async (ur, id, timeout) => {
  const grammar = await getGrammarDetails(id, timeout);

  if (!grammar || !grammar.pattern) return false;

  return (checkDigit(grammar.pattern, ur) && ur) || false;
};

const checkCustomGrammar = async ({ ur, language, id, defaultLanguage, translateService, timeout }) => {
  let grammar = await getGrammarDetails(id, timeout);

  if (!grammar) {
    console.log(`checkCustomGrammar - Can not get grammar details => return no intent`);

    return {};
  }

  let prediction;

  const { engine: Engine, name: GrammarName, companyId, extenData, pattern, engineType } = grammar;

  console.log(
    `${Engine ? `Engine enabled => checking grammar with GPT` : `Engine disabled => checking grammar with local service`}`
  );

  if (!isFalse(Engine)) {
    let extendData = tryParseJSON(extenData);

    let { directory, ref_id } = Array.isArray(extendData)
      ? extendData.find((e) => e.language == (language && language.split('-')[0])) || extendData[0]
      : extendData || { directory: undefined, language: undefined };

    if (!directory && !ref_id && !extenData) {
      console.log(`Missing directory can not use GPT to predict! => return no intent`);
      return {};
    }

    const patternJson = tryParseJSON(pattern);

    if (!isThisLanguageTrained({ pattern: patternJson, language })) {
      console.log(
        `[checkCustomGrammar] - SET DEFAULT LANG - Could not found user expression for specific lang - lang: ${language} => using default lang to predict - defaultLang: ${defaultLanguage}`
      );

      const translatedMsg = await translate(ur, language, defaultLanguage, translateService);

      console.log(
        `[checkCustomGrammar] - TRANSLATE MSG - srcMsg: ${ur} - srcLang: ${language} - destMsg: ${translatedMsg} - destLang: ${defaultLanguage}`
      );

      language = defaultLanguage;
      ur = translatedMsg;
    }

    prediction = await recognizeChatGPT(directory || ref_id || extenData, ur, language, engineType, timeout);
  } else {
    if (!companyId || !GrammarName) {
      console.log(
        `Missing data can not predict - ID : "${companyId} - Grammar: "${GrammarName}" - "${language}" => return no intent`
      );
      return {};
    }

    const patternJson = tryParseJSON(pattern);

    if (!isThisLanguageTrained({ pattern: patternJson, language })) {
      console.log(
        `[checkCustomGrammar] - SET DEFAULT LANG - Could not found user expression for specific lang - lang: ${language} => using default lang to predict - defaultLang: ${defaultLanguage}`
      );

      const translatedMsg = await translate(ur, language, defaultLanguage, translateService);

      console.log(
        `[checkCustomGrammar] - TRANSLATE MSG - srcMsg: ${ur} - srcLang: ${language} - destMsg: ${translatedMsg} - destLang: ${defaultLanguage}`
      );

      language = defaultLanguage;
      ur = translatedMsg;
    }

    prediction = await getPrediction(companyId, GrammarName, ur, language, timeout);
  }

  let userIntent =
    prediction && (prediction.intent || (prediction.intents[0] && prediction.intents[0].Intent) || prediction.intents[0]);

  if (!userIntent || userIntent == 'None') {
    console.log('Can not recognize user intent => return no intent');
    return {};
  }

  return {
    intent: userIntent,
    entity: getEntity(prediction && prediction.entities, Engine === true),
    sentiment: prediction && prediction.sentiment,
  };
};

const checkCustomFunction = async ({ FunctionId, data, ur, timeout }) => {
  const func = await getFunctionDetails(FunctionId, timeout);

  if (!func) return false;

  try {
    const { code, codeFormat, companyId, language, name, param } = func;

    let { result, error } = await CustomFunction({
      FunctionId: FunctionId,
      FunctionName: name,
      CompanyId: companyId,
      Code: code,
      FormattedCode: codeFormat,
      CodeLanguage: language,
      Params: (param && { [param.split('|')[0]]: ur }) || {},
      ConversationData: data,
      timeout,
    });

    if (error) throw error;

    return result;
  } catch (e) {
    e.ERROR_CODE = ERROR_CODES.FUNCTION_FAILED;
    e.ERROR_MESSAGE = `Call Service Custom Function failed: ${e.message}. StatusCode ${e.response && e.response.status}`;
    throw e;
  }
};

const checkPhraseList = async ({ ur, id, service, language, timeout }) => {
  const grammar = await getGrammarDetails(id, timeout);
  if (!grammar || !grammar.pattern) return false;

  let text = ur.toLowerCase();

  if (language && !language.startsWith('en')) {
    text = (await translate(ur, language, 'en', service, timeout)) || ur;
  }

  let parsePattern;

  if (grammar.pattern) {
    parsePattern = tryParseJSON(grammar.pattern);
  }

  let result = false;

  if (Array.isArray(parsePattern) && parsePattern.length) {
    parsePattern.forEach((pattern) => {
      if (pattern.code === language.slice(0, 2) && Array.isArray(pattern.value)) {
        pattern.value.forEach((v) => {
          if (text.includes(v.value.toLowerCase())) {
            result = v.value;
          }
        });
      }
    });
  }
  return result;
};

const checkLLM = async ({ ur, id, timeout }) => {
  const { pattern, engineType } = (await getGrammarDetails(id, timeout)) || {};

  if (!pattern || !process.env.LLM_INTENT_PROMPT) return {};

  const result = {};

  //handle intents
  let { intents, entities } = tryParseJSON(pattern);

  if (Array.isArray(intents) && intents.length) {
    intents = intents.map((e) => e.value);

    const prompt = replaceStrWithParam({ INTENT: intents.join(', ') }, process.env.LLM_INTENT_PROMPT);

    const { error: intentErr, result: intentRs } = await LLM({
      Text: ur,
      Prompt: prompt,
      Model: engineType,
      NumberOutput: pattern.NumberOutput,
      FrequencyPenalty: pattern.FrequencyPenalty,
      PresencePenalty: pattern.PresencePenalty,
      ResponseFormat: pattern.ResponseFormat,
      timeout,
    });

    if (intentErr) {
      intentErr.ERROR_CODE = engineType === 'gemini' ? ERROR_CODES.GEMINI_FAILED : ERROR_CODES.GPT_FAILED;
      intentErr.ERROR_MESSAGE = intentErr.message;
      throw intentErr;
    }

    try {
      result.intent = typeof intentRs === 'string' ? JSON.parse(intentRs).intent : intentRs.intent;

      if (result.intent === 'none') result.intent = '';
    } catch (e) {
      result.intent = '';
    }
  }

  if (!process.env.LLM_ENTITY_PROMPT || !Array.isArray(entities) || !entities.length) return result;
  //handle entities
  entities = entities.map((e) => e.value);

  const entityPrompt = replaceStrWithParam(
    { ENTITY: entities.join(', '), CURRENT_DATE: moment().format('MM-DD-YYYY') },
    process.env.LLM_ENTITY_PROMPT
  );

  const { error: entityErr, result: entityRs } = await LLM({
    Text: ur,
    Prompt: entityPrompt,
    Model: engineType,
    NumberOutput: pattern.NumberOutput,
    FrequencyPenalty: pattern.FrequencyPenalty,
    PresencePenalty: pattern.PresencePenalty,
    ResponseFormat: pattern.ResponseFormat,
    timeout,
  });

  if (entityErr) {
    entityErr.ERROR_CODE = engineType === 'gemini' ? ERROR_CODES.GEMINI_FAILED : ERROR_CODES.GPT_FAILED;
    entityErr.ERROR_MESSAGE = entityErr.message;
    throw entityErr;
  }

  try {
    result.entity = typeof entityRs === 'string' ? JSON.parse(entityRs) : entityRs;
  } catch (e) {
    result.entity = {};
  }

  return result;
};

const checkMultipleGrammars = async ({
  GrammarArray,
  input,
  defaults,
  translateService,
  callFlowId,
  LANGUAGE,
  data,
  DEFAULT_LANGUAGE,
  translateUR = true,
  timeout = 30,
}) => {
  let intent = '',
    entity = '',
    sentiment = '';
  let Grammars = defaults || [{}];
  let notMatches = [];

  try {
    const tempGrammars = JSON.parse(GrammarArray);

    if (!tempGrammars.length) {
      console.log('Empty grammar array, type any => return intent = input');
      return { intent: input, passedGrammar: '' };
    }

    if (!Array.isArray(tempGrammars)) throw new Error('GrammarsArray is not an array or empty');

    Grammars = tempGrammars;
  } catch (e) {
    console.log(`Can not parse Grammar array - Data : ${JSON.stringify(GrammarArray)} - Error : ${e.message}`);
  }

  if (typeof input != 'string' && typeof input != 'number')
    console.log(`Input type is not a string or number => Only check grammar with custom functions!`);

  for (const grammar of Grammars) {
    const { type, id, name } = grammar || {};

    console.log(`Checking grammar - Name: ${name} - Type : ${type}`);

    try {
      if (type == 'Any') {
        return { intent: input };
      }

      if (type == 'Function') {
        intent = await checkCustomFunction({
          FunctionId: id,
          data,
          ur: input,
          callFlowId,
          timeout: timeout,
        });
      }

      if (intent) {
        console.log(
          `Input "${input}" passed Grammar : ${name} - Type: ${type} - Intent found : ${JSON.stringify(
            intent
          )} => check for next case`
        );
        return { intent, entity, notMatches, sentiment, passedGrammar: name };
      }

      // skip not string or number
      if (typeof input != 'string' && typeof input != 'number') continue;

      input = input.toString();

      if (type == 'Digit') {
        intent = await checkDigitPattern(input, id, timeout);
      }

      if (type == 'LLM') {
        let { intent: it, entity: et } = await checkLLM({ ur: input, id, timeout });
        intent = it;
        entity = et;
      }

      if (type == 'PhraseList') {
        intent = await checkPhraseList({
          ur: input,
          id,
          service: translateService,
          language: LANGUAGE,
          timeout,
        });
      }

      if (type == 'BuiltIn') {
        intent = await checkBuiltIn({
          ur: input,
          type: name,
          service: translateService,
          language: LANGUAGE,
          timeout: timeout,
          translateUR,
        });
      }

      if (type == 'Custom') {
        let {
          intent: it,
          entity: et,
          sentiment: st,
        } = await checkCustomGrammar({
          ur: input,
          id,
          name,
          language: LANGUAGE,
          defaultLanguage: DEFAULT_LANGUAGE,
          translateService,
          timeout,
        });
        intent = it;
        entity = et;
        sentiment = st;
      }

      if (intent) {
        console.log(
          `Input "${input}" passed Grammar : ${name} - Type: ${type} - Intent found : ${JSON.stringify(
            intent
          )} => check for next case`
        );
        return { intent, entity, notMatches, sentiment, passedGrammar: name };
      }
      notMatches.push({ grammarType: type, grammarName: name });
    } catch (ex) {
      console.log(`Handle grammar failed - grammar data: ${JSON.stringify(grammar)} - err: ${ex.message}`);
      throw ex;
    }
  }

  return { intent: '', entity: '', notMatches, sentiment: '', passedGrammar: '' };
};

module.exports = {
  checkBuiltIn,
  checkDigitPattern,
  checkCustomGrammar,
  checkCustomFunction,
  checkMultipleGrammars,
};
