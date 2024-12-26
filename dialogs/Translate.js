const { ComponentDialog, WaterfallDialog, TextPrompt } = require('botbuilder-dialogs');
const { TRANSLATE_DIALOG, ERROR_CODES } = require('../constant');
const { replaceStrWithParam, isFalse } = require('../util/helper');
const translate = require('../services/translate');

const TRANSLATE_WATERFALL = 'TRANSLATE_WATERFALL';
const TRANSLATE_PROMPT = 'TRANSLATE_PROMPT';

class TranslateDialog extends ComponentDialog {
  constructor(dialog) {
    super(TRANSLATE_DIALOG);
    this.dialog = dialog;

    this.addDialog(new TextPrompt(TRANSLATE_PROMPT));

    this.addDialog(new WaterfallDialog(TRANSLATE_WATERFALL, [this.Translate.bind(this)]));

    this.initialDialogId = TRANSLATE_WATERFALL;
  }

  async Translate(step) {
    const {
      Key,
      Name,
      OtherCases,
      SourceLanguage,
      TargetLanguage,
      Text,
      CodeSourceLanguage,
      CodeTargetLanguage,
      Attribute,
      Cases,
    } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);
    const { flowData, conversationId, translateService, serviceRequestTimeout } = conversationData;
    const { flowId, flowName } = flowData.flowInfo[0];

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [Translate] ${Name} - Key : ${Key}`);

    if (isFalse(CodeSourceLanguage)) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [Translate] Invalid source language => go to other case`);

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.TRANSLATE.TRANSLATE_SOURCE_EMPTY,
        ERROR_MESSAGE: 'Source language value is empty',
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog(OtherCases);
    }

    if (isFalse(CodeTargetLanguage)) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [Translate] Invalid destination language => go to other case`
      );

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.TRANSLATE.TRANSLATE_DESTINATION_EMPTY,
        ERROR_MESSAGE: 'Destination language value is empty',
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog(OtherCases);
    }

    let text = replaceStrWithParam(conversationData.data, Text);

    if (!text) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [Translate] Translated text failed => got to other case`);

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.TRANSLATE.TRANSLATE_INPUT_EMPTY,
        ERROR_MESSAGE: 'Translate input is empty',
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog(OtherCases);
    }

    text = await translate(text, CodeSourceLanguage, CodeTargetLanguage, translateService, serviceRequestTimeout);

    if (!text) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [Translate] Translated text failed => got to other case`);

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.TRANSLATE.TRANSLATE_OUTPUT_EMPTY,
        ERROR_MESSAGE: 'Translate output is empty',
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog(OtherCases);
    }

    conversationData.data = { ...conversationData.data, [Attribute]: text };

    console.log(
      `[${conversationId} - ${flowId} - ${flowName}] Translated "${Text}" from ${SourceLanguage} to ${TargetLanguage} - Save to ${Attribute}`
    );

    return await step.endDialog(Cases);
  }
}

module.exports = {
  TranslateDialog,
};
