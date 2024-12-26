const { ComponentDialog, WaterfallDialog, TextPrompt } = require('botbuilder-dialogs');
const { TRANSFER_DIALOG, ERROR_CODES } = require('../constant');
const { replaceStrWithParam, endConversation, extractText } = require('../util/helper');
const { getPromptMultipleMessage } = require('../util/prompts');

const users = require('../services/user');
const translate = require('../services/translate');
const { CustomError } = require('../classes/CustomError');

const TRANSFER_WATERFALL = 'TRANSFER_WATERFALL';
const TRANSFER_PROMPT = 'TRANSFER_PROMPT';

class TransferDialog extends ComponentDialog {
  constructor(dialog) {
    super(TRANSFER_DIALOG);
    this.dialog = dialog;

    this.addDialog(new TextPrompt(TRANSFER_PROMPT));

    this.addDialog(
      new WaterfallDialog(TRANSFER_WATERFALL, [this.connectAgent.bind(this), this.connectAgentMultipleMessages.bind(this)])
    );

    this.initialDialogId = TRANSFER_WATERFALL;
  }

  async connectAgent(step) {
    const { Text, Name, Key, TransferDestination, Content } = step._info.options;

    if (Content) return await step.next();

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    const { data, user, translateService, flowData, defaultLanguage, conversationId } = conversationData;
    const { LANGUAGE } = data;
    const { flowId, flowName } = flowData.flowInfo[0];

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [Transfer] ${Name} - Key: ${Key}`);

    user.newStatus = true; //trigger add token
    user.finalStep = true;
    user.vdn = replaceStrWithParam(data, TransferDestination);
    users.update(user);

    if (!user.vdn) {
      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.TRANSFER.TRANSFER_DESTINATION_EMPTY,
        ERROR_MESSAGE: `Transfer destination is empty`,
        CURRENT_ACTION_NAME: Name,
      };

      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [Transfer] Transfer destination is empty => go to error handler`
      );

      await endConversation(step);

      throw new CustomError(
        `Transfer destination is empty`,
        ERROR_CODES.TRANSFER.TRANSFER_DESTINATION_EMPTY,
        `Transfer destination is empty`
      );
    }

    let msg = extractText(Text, LANGUAGE, defaultLanguage);

    msg.text = replaceStrWithParam(data, msg.text);

    msg.text = await translate(msg.text, msg.language, LANGUAGE, translateService);

    if (msg.text) {
      const rsp = await step.context.sendActivity(msg.text);

      if (!rsp.success) {
        conversationData.runErrorFlow = true;

        conversationData.data = {
          ...conversationData.data,
          ERROR_CODE: ERROR_CODES.SEND_FAILED,
          ERROR_MESSAGE: rsp.message,
          CURRENT_ACTION_NAME: Name,
        };

        return await step.endDialog();
      }
    }

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [Transfer] Transfering user ${user.id}, end conversation.`);

    Object.keys(conversationData).forEach((key) => delete conversationData[key]);

    return await endConversation(step);
  }

  async connectAgentMultipleMessages(step) {
    const { Name, Key, TransferDestination, Content } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    const { data, user, translateService, flowData, defaultLanguage, conversationId, serviceRequestTimeout } =
      conversationData;
    const { LANGUAGE } = data;
    const { flowId, flowName } = flowData.flowInfo[0];

    user.newStatus = true; //trigger add token
    user.finalStep = true;
    user.vdn = replaceStrWithParam(data, TransferDestination);
    users.update(user);

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [Transfer] ${Name} - Key: ${Key}`);

    if (!user.vdn) {
      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.TRANSFER.TRANSFER_DESTINATION_EMPTY,
        ERROR_MESSAGE: `Transfer destination is empty`,
        CURRENT_ACTION_NAME: Name,
      };

      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [Transfer] Transfer destination is empty => go to error handler`
      );

      await endConversation(step);

      throw new CustomError(
        `Transfer destination is empty`,
        ERROR_CODES.TRANSFER.TRANSFER_DESTINATION_EMPTY,
        `Transfer destination is empty`
      );
    }

    let messages = getPromptMultipleMessage('', Content, LANGUAGE, defaultLanguage, 0, true);

    if (messages.length) {
      for (let msg of messages) {
        if (msg.type == 'text') {
          msg.value = replaceStrWithParam(data, msg.value);
          msg.value = await translate(msg.value, msg.language, LANGUAGE, translateService, serviceRequestTimeout);
          if (msg.value) {
            const rsp = await step.context.sendActivity(msg.value);

            if (!rsp.success) {
              conversationData.runErrorFlow = true;

              conversationData.data = {
                ...conversationData.data,
                ERROR_CODE: ERROR_CODES.SEND_FAILED,
                ERROR_MESSAGE: rsp.message,
                CURRENT_ACTION_NAME: Name,
              };

              return await step.endDialog();
            }
          }
        }
      }
    }

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [Transfer] Transfering user ${user.id}, end conversation.`);

    Object.keys(conversationData).forEach((key) => delete conversationData[key]);

    return await endConversation(step);
  }
}

module.exports = {
  TransferDialog,
};
