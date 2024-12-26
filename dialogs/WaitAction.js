const { ComponentDialog, WaterfallDialog } = require('botbuilder-dialogs');
const { traceLog } = require('../services/callflowLog');

const { WAIT_DIALOG } = require('../constant');

const WAIT_WATERFALL = 'WAIT_WATERFALL';

class WaitDialog extends ComponentDialog {
  constructor(dialog) {
    super(WAIT_DIALOG);
    this.dialog = dialog;

    this.addDialog(new WaterfallDialog(WAIT_WATERFALL, [this.wait.bind(this)]));

    this.initialDialogId = WAIT_WATERFALL;
  }

  // ask
  async wait(step) {
    const { Key, Name, Second } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);
    const { from, sender, recipient, companyId, callId, callFlowId, data, allowLogInfo, flowData, serviceRequestTimeout } =
      conversationData;

    const { flowId, flowName } = flowData.flowInfo[0];

    console.log(`[${flowId} - ${flowName}] [Wait] ${Name} - Key : ${Key}`);

    try {
      if (isNaN(Second)) {
        console.log('Wait second is not an integer or empty => end dialog');
        throw new Error('Wait second is not an integer or empty');
      }

      await sleep(Second * 1000);

      console.log(`Waited for ${Second} seconds`);
      await traceLog({
        from,
        sender,
        recipient,
        companyId,
        callId,
        callFlowId,
        data,
        name: Name,
        allowLogInfo,
        content: `Action: ${Name} | Waited for ${Second} seconds`,
        logType: 'info',
        actionName: Name,
        actionKey: Key,
        currentFlowId: flowId,
        timeout: serviceRequestTimeout,
      });
    } catch (err) {
      console.log(err.message);
      await traceLog({
        from,
        sender,
        recipient,
        companyId,
        callId,
        callFlowId,
        data,
        name: Name,
        allowLogInfo,
        content: `Action: ${Name} | Error: Can not wait action | Message: ${err.message}`,
        logType: 'error',
        actionName: Name,
        actionKey: Key,
        currentFlowId: flowId,
        timeout: serviceRequestTimeout,
      });
    }
    return await step.endDialog(step._info.options);
  }
}

const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));

module.exports = {
  WaitDialog,
};
