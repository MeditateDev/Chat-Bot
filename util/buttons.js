const { CustomActivityTypes } = require('../classes/CustomActivityTypes');
const translate = require('../services/translate');
const { tryParseJSON, isFalse, replaceStrWithParam } = require('./helper');

module.exports = class Buttons {
  constructor(btnObj) {
    const {
      AllowAnswerOption: allowAnswerOption,
      AnswerOptionType: answerOptionType,
      GrammarArray: grammarArray,
      data,
      defaultLanguage,
      Answer: answer,
      AnswerCustom: answerCustom,
      channelId,
      service,
    } = btnObj;

    this.allowAnswerOption = allowAnswerOption ?? false;
    this.answerOptionType = answerOptionType ?? 1;
    this.grammarArray = grammarArray ?? [];
    this.data = data;
    this.defaultLanguage = defaultLanguage;
    this.answer = answer;
    this.answerCustom = answerCustom ?? null;
    this.channelId = channelId;
    this.translateService = service;
  }

  async formatButtons() {
    const results = {
      channelData: {},
      type: CustomActivityTypes.Buttons,
    };

    const { LANGUAGE } = this.data;

    if (!isFalse(this.allowAnswerOption)) {
      if (this.answerOptionType == 2) {
        const customButtons = this.handleCustomButtons(this.data[this.answerCustom]);
        results.channelData.buttons = await this.getButtons(customButtons, LANGUAGE, this.defaultLanguage);
      } else {
        results.channelData.buttons = await this.getButtons(this.answer, LANGUAGE, this.defaultLanguage);
      }
    }

    //check if intent yes-no built-in and there is no buttons then add the Yes No button for built-in
    if (
      this.grammarArray &&
      this.grammarArray.includes('"name":"Yes or No","type":"BuiltIn"') &&
      isFalse(this.allowAnswerOption)
    ) {
      results.channelData.buttons = await this.getButtons(
        JSON.stringify([
          {
            name: 'yes',
            value: [{ name: 'English', language: 'en-US', value: 'Yes' }],
          },
          {
            name: 'no',
            value: [{ name: 'English', language: 'en-US', value: 'No' }],
          },
        ]),
        LANGUAGE
      );
      this.allowAnswerOption = true;
    }

    return results;
  }

  async getButtons(btns, language = 'en', defaultLanguage = 'en') {
    if (typeof btns === 'string') btns = tryParseJSON(btns);

    if (!Array.isArray(btns)) return [];

    let results = [];

    for (let btn of btns) {
      try {
        const { name, value } = btn;

        if (!Array.isArray(value) || !name) continue;

        const defaultLanguageButton =
          value.find(
            (v) => v && v.language && (v.language == defaultLanguage || v.language.includes(defaultLanguage.split('-')[0]))
          ) || {};

        let translatedButton =
          value.find((v) => v && v.language && (v.language == language || v.language.includes(language))) || {};

        let useLang = translatedButton.value ? language : defaultLanguage;

        translatedButton.value = replaceStrWithParam(this.data, translatedButton.value || defaultLanguageButton.value);

        translatedButton.value = await translate(translatedButton.value, useLang, language, this.translateService);

        if (!translatedButton || !translatedButton.value) continue;

        results.push({
          name: translatedButton.value,
          value: name,
        });
      } catch (e) {
        console.log(`[getButtons] Get button failed: ${e.message || e}`);
      }
    }

    return results;
  }

  handleCustomButtons(variable) {
    if (!variable) return [];

    try {
      if (typeof variable === 'string') variable = JSON.parse(variable);

      if (!Array.isArray(variable)) throw new Error(`Invalid custom button variable ${JSON.stringify(variable)}`);

      // [ { "buttonValue": "yes", "buttonText": [ { "language": "en", "value": "Yes" }, { "language": "vi", "value": "Vâng" } ] }, { "buttonValue": "no", "buttonText": [ { "language": "en", "value": "No, thanks!" }, { "language": "vi", "value": "Không, cảm ơn!" } ] } ]

      let result = variable.map((b) => {
        const { buttonValue, buttonText } = b || {};

        if (!buttonValue || typeof buttonValue != 'string' || !buttonText) return;

        return { name: buttonValue, value: buttonText };
      });

      return result.filter(Boolean);
    } catch (e) {
      console.log(`Get custom buttons failed : ${e.message}`);
      return [];
    }
  }
};
