const { ComponentDialog, WaterfallDialog } = require('botbuilder-dialogs');

// dialog IDs
const { SET_ATTRIBUTE_DIALOG } = require('../constant');
const { updateObjWithParams, paramsExtract, detectChangedValues } = require('../util/helper');

const SET_ATTRIBUTE_WATERFALL = 'SET_ATTRIBUTE_WATERFALL';

class SetAttributeDialog extends ComponentDialog {
  constructor(dialog) {
    super(SET_ATTRIBUTE_DIALOG);
    this.dialog = dialog;

    this.addDialog(new WaterfallDialog(SET_ATTRIBUTE_WATERFALL, [this.setAttribute.bind(this)]));

    this.initialDialogId = SET_ATTRIBUTE_WATERFALL;
  }

  // ask
  async setAttribute(step) {
    const { Attribute, Name, Id, Key } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    const { data, flowData, conversationId } = conversationData;

    const { flowId, flowName } = flowData.flowInfo[0];

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [SetAttribute] ${Name} - Key: ${Key}`);

    conversationData.data = updateObjWithParams(conversationData.data, paramsExtract(Attribute));

    console.info(
      `[${conversationId} - ${flowId} - ${flowName}] [SetAttribute] New attributes: ${JSON.stringify(
        detectChangedValues(data, conversationData.data)
      )}`
    );

    return await step.endDialog(step._info.options);
  }
}

module.exports = {
  SetAttributeDialog,
};
