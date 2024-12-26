const { ComponentDialog, WaterfallDialog } = require('botbuilder-dialogs');

const { SUBACTION_DIALOG } = require('../constant');
const { findAction } = require('../util/helper');

const SUBACTION_WATERFALL = 'SUBACTION_WATERFALL';

class SubActionDialog extends ComponentDialog {
  constructor(dialog) {
    super(SUBACTION_DIALOG);
    this.dialog = dialog;

    this.addDialog(new WaterfallDialog(SUBACTION_WATERFALL, [this.findSubAction.bind(this)]));

    this.initialDialogId = SUBACTION_WATERFALL;
  }

  async findSubAction(step) {
    const { Key } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);
    const { flowData } = conversationData;
    const { flowId, flowName } = flowData.flowInfo[0];

    console.log(`[${flowId} - ${flowName}] [SubAction] Key: ${Key}`);

    let subAction = findAction(conversationData.flowData.currentFlow, Key);

    if (!subAction) console.log(`[SubAction] No action found`);

    return await step.endDialog({ Action: subAction });
  }
}

module.exports = {
  SubActionDialog,
};
