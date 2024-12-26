const { ComponentDialog, WaterfallDialog } = require('botbuilder-dialogs');

const { INTENT_RECOGNITION_DIALOG, ERROR_CODES } = require('../constant');
const { getValueByPath, replaceStrWithParam, assignValueToObject, isFalse, formatEntitiesLog } = require('../util/helper');
const { checkMultipleGrammars } = require('../services/grammars');
const { logRecognizeNoIntent, traceLog } = require('../services/callflowLog');

const INTENT_RECOGNITION_WATERFALL = 'INTENT_RECOGNITION_WATERFALL';

class IntentRecognitionDialog extends ComponentDialog {
  constructor(dialog) {
    super(INTENT_RECOGNITION_DIALOG);
    this.dialog = dialog;

    this.addDialog(new WaterfallDialog(INTENT_RECOGNITION_WATERFALL, [this.checkGrammars.bind(this)]));

    this.initialDialogId = INTENT_RECOGNITION_WATERFALL;
  }

  async checkGrammars(step) {
    const { Text, Attribute, GrammarArray, EntityAttribute, Name, Key, OtherCases } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    const {
      data,
      translateService,
      companyId,
      callFlowId,
      sender,
      flowData,
      callId,
      from,
      recipient,
      allowLogInfo,
      conversationId,
      serviceRequestTimeout,
    } = conversationData;

    const { flowId, flowName } = flowData.flowInfo[0];

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [IntentRecognition] ${Name} - Key: ${Key}`);

    const { LANGUAGE, DEFAULT_LANGUAGE } = data;

    if (!Text || typeof Text != 'string') {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [IntentRecognition] Input is empty => go to other case`);

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.INTENT_RECOGNITION.INTENT_REC_INPUT_EMPTY,
        ERROR_MESSAGE: `Input is empty`,
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog({
        ...step._info.options,
        CheckForNextCase: true,
        AttributeToCheck: Attribute,
      });
    }

    let input = '';

    //get input
    if (Text.match(/^{[\w->]+}$/)) {
      input = getValueByPath(conversationData.data, Text.replace(/{|}/g, ''));
    } else {
      input = replaceStrWithParam(conversationData.data, Text);
    }

    if (!input) {
      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.INTENT_RECOGNITION.INTENT_REC_INPUT_EMPTY,
        ERROR_MESSAGE: `Input is empty`,
        CURRENT_ACTION_NAME: Name,
      };

      console.log(`[${conversationId} - ${flowId} - ${flowName}] [IntentRecognition] Input is empty => go to other case`);

      return await step.endDialog(OtherCases);
    }

    let result = {};

    //check grammars
    try {
      result = await checkMultipleGrammars({
        GrammarArray,
        input,
        translateService,
        companyId,
        callFlowId,
        sender,
        LANGUAGE,
        data: conversationData.data,
        DEFAULT_LANGUAGE,
        timeout: serviceRequestTimeout,
      });
    } catch (e) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [IntentRecognition] Check multiple grammar failed ${e.message} => go to error handler`
      );

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: e.ERROR_CODE,
        ERROR_MESSAGE: e.ERROR_MESSAGE,
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog();
    }

    const { intent, entity, notMatches, passedGrammar } = result;

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
      content: `Action: ${Name} | Grammar: ${passedGrammar} | Intent: ${intent} | Entity: ${formatEntitiesLog(entity)}`,
      logType: 'info',
      actionName: Name,
      actionKey: Key,
      currentFlowId: flowId,
      timeout: serviceRequestTimeout,
    });

    if (!intent && Array.isArray(notMatches) && notMatches.length) {
      logRecognizeNoIntent({ companyId, callFlowId, callId, text: input, responseList: notMatches });
    }

    if (intent && !isFalse(Attribute)) {
      assignValueToObject(conversationData.data, Attribute, intent);
    }

    if (entity && !isFalse(EntityAttribute)) assignValueToObject(conversationData.data, EntityAttribute, entity);

    return await step.endDialog({
      ...step._info.options,
      CheckForNextCase: true,
      AttributeToCheck: Attribute,
      ValueCheckNextCase: isFalse(Attribute) && intent,
    });
  }
}

module.exports = {
  IntentRecognitionDialog,
};
