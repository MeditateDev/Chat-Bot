const { ComponentDialog, WaterfallDialog } = require('botbuilder-dialogs');

// dialog IDs
const { CHECK_ATTRIBUTE_DIALOG, ERROR_CODES } = require('../constant');
const { checkCase } = require('../util/helper');
const { traceLog } = require('../services/callflowLog');

const CHECK_ATTRIBUTE_WATERFALL = 'CHECK_ATTRIBUTE_WATERFALL';

class CheckAttributeDialog extends ComponentDialog {
  constructor(dialog) {
    super(CHECK_ATTRIBUTE_DIALOG);
    this.dialog = dialog;
    this.addDialog(new WaterfallDialog(CHECK_ATTRIBUTE_WATERFALL, [this.checkAttribute.bind(this)]));

    this.initialDialogId = CHECK_ATTRIBUTE_WATERFALL;
  }

  // ask
  async checkAttribute(step) {
    const { Cases, OtherCases, Attribute, Name, Key } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);
    const { companyId, callFlowId, sender, data, allowLogInfo, callId, recipient, conversationId, flowData } =
      conversationData;

    const { flowId, flowName } = flowData.flowInfo[0];

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [CheckAttribute] ${Name} - Key: ${Key}`);

    if (!Attribute) {
      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.CHECK_VARIABLE.CHECK_VARIABLE_FIELD_EMPTY,
        ERROR_MESSAGE: `Variable field is empty`,
        CURRENT_ACTION_NAME: Name,
      };

      await traceLog({
        sender,
        recipient,
        companyId,
        callId,
        callFlowId,
        data,
        allowLogInfo,
        content: `Variable field is empty`,
        logType: 'info',
        actionName: Name,
        actionKey: Key,
        currentFlowId: flowId,
      });

      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [CheckAttribute] Variable field is empty => go to error handler`
      );

      return await step.endDialog();
    }

    let rightCase;

    for (let Case of Cases) {
      rightCase = checkCase({ Case, Attribute, ConversationData: data });

      if (rightCase) break;
    }

    if (rightCase && rightCase.Action) {
      console.log(
        `Check ${Attribute}=${JSON.stringify(rightCase.BOT_DATA_CHECK)} - Passed case ${rightCase.BOT_COMPARE} ${
          rightCase.BOT_ATTRIBUTE_CHECK
        }`
      );

      await traceLog({
        sender,
        recipient,
        companyId,
        callId,
        callFlowId,
        data,
        allowLogInfo,
        content: `Check ${Attribute}=${JSON.stringify(rightCase.BOT_DATA_CHECK)} - Passed case ${rightCase.BOT_COMPARE} ${
          rightCase.BOT_ATTRIBUTE_CHECK
        }`,
        logType: 'info',
        actionName: Name,
        actionKey: Key,
        currentFlowId: flowId,
      });

      return await step.endDialog(rightCase);
    }

    console.log(
      `Check ${Attribute}=${JSON.stringify(JSON.stringify(data[Attribute]))} - Not passed any case => go to other case`
    );

    await traceLog({
      sender,
      recipient,
      companyId,
      callId,
      callFlowId,
      data,
      allowLogInfo,
      content: `Check ${Attribute}=${JSON.stringify(JSON.stringify(data[Attribute]))} - Not passed any case`,
      logType: 'info',
      actionName: Name,
      actionKey: Key,
      currentFlowId: flowId,
    });

    return await step.endDialog(OtherCases);
  }
}

module.exports = {
  CheckAttributeDialog,
};
