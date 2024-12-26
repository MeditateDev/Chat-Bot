const { ComponentDialog, WaterfallDialog } = require('botbuilder-dialogs');
const helper = require('../util/helper');

const { HANG_UP_DIALOG } = require('../constant');

const HANG_UP_WATERFALL = 'HANG_UP_WATERFALL';

class HangUpDialog extends ComponentDialog {
  constructor(dialog) {
    super(HANG_UP_DIALOG);
    this.dialog = dialog;

    this.addDialog(new WaterfallDialog(HANG_UP_WATERFALL, [this.hangUp.bind(this)]));

    this.initialDialogId = HANG_UP_WATERFALL;
  }

  async hangUp(step) {
    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    console.log(`[Hang Up] End conversation for ${conversationData.data.USER_ID}`);

    Object.keys(conversationData).forEach((key) => delete conversationData[key]);

    return await helper.endConversation(step);
  }
}

module.exports = {
  HangUpDialog,
};
