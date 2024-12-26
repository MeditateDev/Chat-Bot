const { ConfirmPrompt, ListStyle, PromptCultureModels, recognizeChoices } = require('botbuilder-dialogs');
const Recognizers = require('@microsoft/recognizers-text-choice');

class CustomConfirmPrompt extends ConfirmPrompt {
  constructor(dialogId, validator, defaultLocale, choiceDefaults) {
    super(dialogId, validator);
    this.style = ListStyle.none;
    this.defaultLocale = defaultLocale;

    if (choiceDefaults == undefined) {
      const supported = {};
      PromptCultureModels.getSupportedCultures().forEach((culture) => {
        supported[culture.locale] = {
          choices: [culture.yesInLanguage, culture.noInLanguage],
          options: {
            inlineSeparator: culture.separator,
            inlineOr: culture.inlineOr,
            inlineOrMore: culture.inlineOrMore,
            includeNumbers: true, // Set includeNumbers to false to remove numbering
          },
        };
      });
      this.choiceDefaults = supported;
    } else {
      this.choiceDefaults = choiceDefaults;
    }
  }
  async onPrompt(context, state, options, isRetry) {
    // Format prompt to send
    let prompt;
    const channelId = context.activity.channelId;
    const culture = this.determineCulture(context.activity);
    const choiceOptions = this.choiceOptions || this.choiceDefaults[culture].options;
    const choices = this.confirmChoices || this.choiceDefaults[culture].choices;
    if (isRetry && options.retryPrompt) {
      prompt = this.appendChoices(options.retryPrompt, channelId, choices, this.style, choiceOptions);
    } else {
      prompt = this.appendChoices(options.prompt, channelId, choices, this.style, choiceOptions);
    }

    // Send prompt
    await context.sendActivity(prompt);
  }

  async onRecognize(context, _state, _options) {
    const result = { succeeded: false };
    const activity = context.activity;
    const utterance = activity.text;
    if (!utterance) {
      return result;
    }
    const culture = this.determineCulture(context.activity);
    const results = Recognizers.recognizeBoolean(utterance, culture);
    if (results.length > 0 && results[0].resolution) {
      result.succeeded = true;
      result.value = results[0].resolution.value;
    } else {
      // If the prompt text was sent to the user with numbers, the prompt should recognize number choices.
      const choiceOptions = this.choiceOptions || this.choiceDefaults[culture].options;

      if (typeof choiceOptions.includeNumbers !== 'boolean' || choiceOptions.includeNumbers) {
        const confirmChoices = this.confirmChoices || this.choiceDefaults[culture].choices;
        const choices = [confirmChoices[0], confirmChoices[1]];
        const secondOrMoreAttemptResults = recognizeChoices(utterance, choices);
        if (secondOrMoreAttemptResults.length > 0) {
          result.succeeded = true;
          result.value = secondOrMoreAttemptResults[0].resolution.index === 0;
        }
      }
    }

    return result;
  }

  static determineCulture(activity = {}) {
    let culture = PromptCultureModels.mapToNearestLanguage(
      activity.locale || this.defaultLocale || PromptCultureModels.English.locale
    );
    if (!(culture && this.choiceDefaults && this.choiceDefaults[culture])) {
      culture = PromptCultureModels.English.locale;
    }

    return culture;
  }
}

module.exports = { CustomConfirmPrompt };
