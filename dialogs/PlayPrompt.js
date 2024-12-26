const { ComponentDialog, TextPrompt, WaterfallDialog } = require('botbuilder-dialogs');

const {
  extractText,
  replaceStrWithParam,
  formatMessage,
  formatMultipleMessage,
  contentTraceLogMultipleMessages,
} = require('../util/helper');
const { getPromptMultipleMessage } = require('../util/prompts');
const { PLAY_PROMPT_DIALOG, ERROR_CODES } = require('../constant');
const translate = require('../services/translate');
const { traceLog } = require('../services/callflowLog');

const TEXT_PROMPT_PLAY_PROMPT = 'TEXT_PROMPT_PLAY_PROMPT';
const NORMAL_MESSAGE_WATERFALL = 'NORMAL_MESSAGE_WATERFALL';

class PlayPromptDialog extends ComponentDialog {
  constructor(dialog) {
    super(PLAY_PROMPT_DIALOG);
    this.dialog = dialog;

    this.addDialog(new TextPrompt(TEXT_PROMPT_PLAY_PROMPT));

    this.addDialog(
      new WaterfallDialog(NORMAL_MESSAGE_WATERFALL, [this.sendMessage.bind(this), this.sendMultipleMessages.bind(this)])
    );

    this.initialDialogId = NORMAL_MESSAGE_WATERFALL;
  }

  // ask
  async sendMessage(step) {
    const { Text, TextChatBot, NextAction, Name, Key, Sentiment, Content, ContentChatBot } = step._info.options;

    if (Content || ContentChatBot) {
      return await step.next();
    }

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);
    const {
      data,
      translateService,
      mediaSetting,
      channelId,
      flowData,
      companyId,
      callFlowId,
      sender,
      recipient,
      from,
      callId,
      allowLogInfo,
      defaultLanguage,
      serviceRequestTimeout,
    } = conversationData;

    const { LANGUAGE } = data;

    const { flowId, flowName } = flowData.flowInfo[0];

    console.log(`[${flowId} - ${flowName}] [PlayPrompt] ${Name} - Key: ${Key}`);

    let msg = extractText(TextChatBot, LANGUAGE, defaultLanguage);

    if (!msg.text) {
      msg = extractText(Text, LANGUAGE, defaultLanguage);
    }

    msg.text = replaceStrWithParam(data, msg.text);

    if (!msg.text) {
      console.log('Receive empty text when extract text => not sending any message and go to next action');

      return await step.endDialog({ NextAction });
    }

    msg.text = await translate(msg.text, msg.language, LANGUAGE, translateService, serviceRequestTimeout);

    let responseData = formatMessage({
      ...step._info.options,
      channelId,
      message: msg.text,
      mediaSetting,
      mediaName: Sentiment,
      lang: LANGUAGE,
      allowSpeak: false,
    });

    await traceLog({
      from,
      sender,
      recipient,
      companyId,
      callId,
      callFlowId,
      data,
      allowLogInfo,
      content: `Action : ${Name} | Prompt: ${msg.text}`,
      logType: 'info',
      actionName: Name,
      actionKey: Key,
      currentFlowId: flowId,
    });

    const rsp = await step.context.sendActivity(responseData);

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

    return await step.endDialog({ NextAction });
  }

  // multiple ask
  async sendMultipleMessages(step) {
    const { NextAction, Name, Key, Sentiment, Content, ContentChatBot } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);
    const {
      data,
      translateService,
      mediaSetting,
      channelId,
      flowData,
      companyId,
      callFlowId,
      sender,
      recipient,
      from,
      callId,
      allowLogInfo,
      defaultLanguage,
      serviceRequestTimeout,
    } = conversationData;
    const { LANGUAGE } = data;

    const { flowId, flowName } = flowData.flowInfo[0];

    console.log(`[${flowId} - ${flowName}] [PlayPrompt] ${Name} - Key: ${Key}`);

    let messages = getPromptMultipleMessage(ContentChatBot, Content, LANGUAGE, defaultLanguage, 0, true);

    if (Array.isArray(messages) && !messages.length) {
      console.log('Receive empty data when extract multiple messages => not sending any message and go to next action');

      await traceLog({
        from,
        sender,
        recipient,
        companyId,
        callId,
        callFlowId,
        data,
        allowLogInfo,
        content: `Action : ${Name} | Receive empty data when extract multiple messages | Go to next action`,
        logType: 'error',
        actionName: Name,
        actionKey: Key,
        currentFlowId: flowId,
        timeout: serviceRequestTimeout,
      });

      return await step.endDialog({ NextAction });
    }

    for (let msg of messages) {
      msg.value = replaceStrWithParam(data, msg.value);
      if (msg.type == 'text') {
        msg.value = await translate(msg.value, msg.language, LANGUAGE, translateService, serviceRequestTimeout);
      }

      let contentMessage = formatMultipleMessage({
        ...step._info.options,
        channelId,
        message: msg,
        mediaSetting,
        mediaName: Sentiment,
        lang: LANGUAGE,
        allowSpeak: true,
      });

      const rsp = await step.context.sendActivity(contentMessage);

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

    await traceLog({
      from,
      sender,
      recipient,
      companyId,
      callId,
      callFlowId,
      data,
      allowLogInfo,
      content: `Action : ${Name} | Prompt: ${contentTraceLogMultipleMessages(messages)}`,
      logType: 'info',
      actionName: Name,
      actionKey: Key,
      currentFlowId: flowId,
      timeout: serviceRequestTimeout,
    });

    return await step.endDialog({ NextAction });
  }
}

module.exports = {
  PlayPromptDialog,
};
