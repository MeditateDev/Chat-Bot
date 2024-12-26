const { ComponentDialog, WaterfallDialog } = require('botbuilder-dialogs');
const { traceLog } = require('../services/callflowLog');

// dialog IDs
const { SET_LANGUAGE_DIALOG, ERROR_CODES } = require('../constant');
const { isFalse, tryParseJSON } = require('../util/helper');

const SET_ATTRIBUTE_WATERFALL = 'SET_ATTRIBUTE_WATERFALL';

class SetLanguageDialog extends ComponentDialog {
  constructor(dialog) {
    super(SET_LANGUAGE_DIALOG);
    this.dialog = dialog;

    this.addDialog(new WaterfallDialog(SET_ATTRIBUTE_WATERFALL, [this.setLanguage.bind(this)]));

    this.initialDialogId = SET_ATTRIBUTE_WATERFALL;
  }

  // ask
  async setLanguage(step) {
    const { Language, Name, Key, Attribute, Option } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);
    const {
      from,
      sender,
      recipient,
      companyId,
      callId,
      callFlowId,
      data,
      allowLogInfo,
      flowData,
      conversationId,
      serviceRequestTimeout,
    } = conversationData;
    const { LANGUAGE } = data;
    const { flowId, flowName } = flowData.flowInfo[0];

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [SetLanguage] ${Name} - Key: ${Key}`);

    try {
      let newLanguage;

      if (isFalse(Option)) {
        throw new Error(`New language option is empty`);
      }

      if (Option != 'listlang' && Option != 'variable') {
        throw new Error(`New language option must be list lang or variable`);
      }

      if (Option == 'listlang') {
        let { language } = tryParseJSON(Language);
        newLanguage = language;
      } else {
        if (!data[Attribute]) {
          throw new Error(`Can not set new language Option:  ${Option}`);
        }
        newLanguage = data[Attribute];
      }

      conversationData.data.LANGUAGE = newLanguage.split('-')[0];
      console.log(`[SetLanguage] Set language from ${LANGUAGE} to ${newLanguage.split('-')[0]}`);
    } catch (err) {
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
        logType: 'error',
        content: `Action: ${Name} | Error: ${err.message}`,
        actionName: Name,
        actionKey: Key,
        currentFlowId: flowId,
        timeout: serviceRequestTimeout,
      });

      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [SetLanguage] Set language failed: ${err.message} => go to error handler`
      );

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.SET_LANGUAGE.LANGUAGE_SET_FAILED,
        ERROR_MESSAGE: `Set language failed: ${err.message}`,
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog();
    }
    return await step.endDialog(step._info.options);
  }
}

module.exports = {
  SetLanguageDialog,
};
