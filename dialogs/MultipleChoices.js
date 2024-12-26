const { ComponentDialog, WaterfallDialog, ChoicePrompt, ChoiceFactory, ListStyle } = require('botbuilder-dialogs');

const { MULTIPLECHOICES_DIALOG } = require('../constant');
const { parseJSONString, extractText, replaceStrWithParam, translateConversation } = require('../util/helper');

const CHOICEPROMPT = 'CHOICEPROMPT';

class MultipleChoicesDialog extends ComponentDialog {
  constructor(dialog) {
    super(MULTIPLECHOICES_DIALOG);
    this.dialog = dialog;

    this.addDialog(new ChoicePrompt(CHOICEPROMPT));

    this.addDialog(new WaterfallDialog('Subflow_Waterfall', [this.Ask.bind(this), this.getAnswer.bind(this)]));

    this.initialDialogId = 'Subflow_Waterfall';
  }

  // get the chat flow step
  async Ask(step) {
    const { Answer, Name, Text, Id, Key } = step._info.options;
    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);
    let { data } = conversationData;

    const { LANGUAGE } = data;

    console.log(`${Id} Action: ${Name} - Key: ${Key}`);

    const choices = parseJSONString(Answer);

    let msg = extractText(Text, LANGUAGE);

    if (msg.language != LANGUAGE) msg = await translateConversation(msg.text, LANGUAGE);

    return await step.prompt(CHOICEPROMPT, {
      prompt: replaceStrWithParam(data, msg),
      choices: ChoiceFactory.toChoices(choices),
      style: ListStyle.suggestedAction,
    });
  }

  async getAnswer(step) {
    let { Attribute, Name, Id, Key } = step._info.options;
    console.log(`${Id} Action: ${Name} - Key: ${Key}`);

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);
    let { data } = conversationData;

    data[Attribute] = step.result.value;

    console.log(`User picked ${step.result.value}, saved to ${data[Attribute]}`);

    return await step.endDialog(step._info.options);
  }
}

module.exports = {
  MultipleChoicesDialog,
};
