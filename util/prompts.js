const getActionPrompts = (repeatedPrompts, callFlowId, Key) => {
  return repeatedPrompts.find((p) => p.id == `${callFlowId}_${Key}`);
};

const getRepeatedTimes = (repeatedPrompts, callFlowId, Key) => {
  if (!repeatedPrompts) return 0;
  let action = repeatedPrompts.find((p) => p.id == `${callFlowId}_${Key}`);
  return (action && action.Repeated) || 0;
};

const getPrompts = (promptString, lang = 'en') => {
  if (!promptString) return [];

  try {
    let prompts = JSON.parse(promptString);
    prompts = prompts.find((p) => p.language && p.language.includes(lang));
    let { textChatBot, text } = prompts || {};

    // from ['text'] to => [{text : '', language : 'en-US'}]
    textChatBot =
      (textChatBot &&
        textChatBot.map((e) => {
          return { text: e, language: lang };
        })) ||
      [];

    text =
      (text &&
        text.map((e) => {
          return { text: e, language: lang };
        })) ||
      [];

    return (textChatBot.length && textChatBot) || text;
  } catch (err) {
    console.log('[getPrompts] error : ' + err.message);
    console.error('[getPrompts] error : ' + err.message);
    console.error(`[getPrompts] Data : ${promptString} , language : ${lang}`);
    console.error(err.stack);
    return [];
  }
};

const getPrompt = (TextChatBot, Text, lang = 'en', defaultLanguage = 'en', Repeated = 0) => {
  if (Repeated < 0) Repeated = 0;

  // get english prompts
  let defaultLanguagePrompts = getPrompts(TextChatBot, defaultLanguage);
  if (!defaultLanguagePrompts.length) defaultLanguagePrompts = getPrompts(Text, defaultLanguage);

  // get exact language prompts
  let prompts = getPrompts(TextChatBot, lang);
  if (!prompts.length) prompts = getPrompts(Text, lang);

  // let defaultLanguagePromptsIndex = Repeated == defaultLanguagePrompts.length ? 0 : Repeated % defaultLanguagePrompts.length;
  // let promptIndex = Repeated == prompts.length ? 0 : Repeated % prompts.length;

  let defaultLanguagePromptsIndex =
    Repeated != 0 && Repeated >= defaultLanguagePrompts.length ? defaultLanguagePrompts.length - 1 : Repeated;
  let promptIndex = Repeated != 0 && Repeated >= prompts.length ? prompts.length - 1 : Repeated;

  return (
    (prompts.length && prompts[promptIndex]) ||
    (defaultLanguagePrompts.length && defaultLanguagePrompts[defaultLanguagePromptsIndex]) || { text: '', language: lang }
  );
};

const updateRepeatedTimes = (repeatedPrompts, callFlowId, Key) => {
  if (!Array.isArray(repeatedPrompts)) {
    console.log(`[updateRepeatedTimes] Not updating, repeatedPrompts is not an array!`);
    return [];
  }

  let result = repeatedPrompts;

  let index = result.findIndex((e) => e.id == callFlowId.toString() + '_' + Key);

  if (index != -1) {
    // add repeated +1 to this action
    let newRepeat = getActionPrompts(repeatedPrompts, callFlowId, Key);
    result[index] = {
      ...newRepeat,
      Repeated: newRepeat.Repeated + 1,
    };
  } else {
    result.push({
      id: callFlowId.toString() + '_' + Key,
      Repeated: 1,
    });
  }

  return result;
};

const getPromptsMultipleMessage = (promptsString, lang = 'en') => {
  if (!promptsString) return [];
  let result = [];
  try {
    let prompts = JSON.parse(promptsString);
    prompts = prompts.find((p) => p.language && p.language.includes(lang));

    let { content } = prompts || {};

    if (!Array.isArray(content) || !content.length) return result;

    content.forEach((ct) => {
      ct = ct
        .map((c) => {
          if (!c.value) return;
          if (c.type === 'text') {
            return { ...c, language: lang };
          }
          return { ...c };
        })
        .filter(Boolean);

      if (!ct.length) return;

      result.push(ct);
    });
  } catch (err) {
    console.log('[getPromptsMultipleMessage] error : ' + err.message);
    console.error('[getPromptsMultipleMessage] error : ' + err.message);
    console.error(`[getPromptsMultipleMessage] Data : ${promptsString} , language : ${lang}`);
    console.error(err.stack);
  }
  return result;
};

const getPromptMultipleMessage = (
  ContentChatBot,
  Content,
  lang = 'en',
  defaultLanguage = 'en',
  Repeated = 0,
  isRandom = false
) => {
  if (Repeated < 0) Repeated = 0;

  // get english prompts
  let defaultLanguagePrompts = getPromptsMultipleMessage(ContentChatBot, defaultLanguage);
  if (!defaultLanguagePrompts.length) defaultLanguagePrompts = getPromptsMultipleMessage(Content, defaultLanguage);

  // get exact language prompts
  let prompts = getPromptsMultipleMessage(ContentChatBot, lang);
  if (!prompts.length) prompts = getPromptsMultipleMessage(Content, lang);

  // random for action play prompt
  let defaultLanguagePromptsIndex = !isRandom
    ? Repeated != 0 && Repeated >= defaultLanguagePrompts.length
      ? defaultLanguagePrompts.length - 1
      : Repeated
    : Math.floor(Math.random() * defaultLanguagePrompts.length);

  let promptIndex = !isRandom
    ? Repeated != 0 && Repeated >= prompts.length
      ? prompts.length - 1
      : Repeated
    : Math.floor(Math.random() * prompts.length);

  return (
    (prompts.length && prompts[promptIndex]) ||
    (defaultLanguagePrompts.length && defaultLanguagePrompts[defaultLanguagePromptsIndex]) ||
    []
  );
};

const getAllTextPrompts = (content, lang = 'en', defaultLanguage = 'en') => {
  try {
    const prompts = JSON.parse(content).find((p) => p.language && p.language.split('-')[0] == lang);

    let result = [];

    prompts.content.forEach((p) =>
      p.forEach((c) => {
        if (c.type === 'text') result.push(c.value);
      })
    );

    return result.filter(Boolean);
  } catch (e) {
    return [];
  }
};

module.exports = {
  getActionPrompts,
  getPrompts,
  getPrompt,
  getRepeatedTimes,
  updateRepeatedTimes,
  getPromptMultipleMessage,
  getAllTextPrompts,
};
