const { ComponentDialog, WaterfallDialog, TextPrompt, Dialog } = require('botbuilder-dialogs');
const { CHATGPT_DIALOG, ERROR_CODES } = require('../constant');
const {
  replaceStrWithParam,
  isFalse,
  isNotUnderstand,
  formatMessage,
  formatMultipleMessage,
  formatEntitiesLog,
  tryParseJSON,
} = require('../util/helper');

const { getPrompt, getPromptMultipleMessage, getAllTextPrompts } = require('../util/prompts');

const { qaChatGPT, GPTChatService, getGPTDirectory, getFunctionDetails, CustomFunction } = require('../services/service');
const { logRecognizeNoIntent, traceLog } = require('../services/callflowLog');
const translate = require('../services/translate');
const { checkMultipleGrammars } = require('../services/grammars');
const { gptConversation, queryKnowledge, getDataset } = require('../services/AI');
const Buttons = require('../util/buttons');

const CHATGPT_WATERFALL = 'CHATGPT_WATERFALL';
const GPT_PROMPT = 'GPT_PROMPT';
const VIRTUAL_AGENT_WATERFALL = 'VIRTUAL_AGENT_WATERFALL';

class ChatGPTDialog extends ComponentDialog {
  constructor(dialog) {
    super(CHATGPT_DIALOG);
    this.dialog = dialog;

    this.addDialog(new TextPrompt(GPT_PROMPT));

    this.addDialog(
      new WaterfallDialog(CHATGPT_WATERFALL, [
        this.GPT.bind(this),
        this.checkIntent.bind(this),
        this.GPTDataset.bind(this),
        this.GPTConversation.bind(this),
      ])
    );

    this.addDialog(
      new WaterfallDialog(VIRTUAL_AGENT_WATERFALL, [
        this.ask.bind(this),
        this.beforeAICustomFunction.bind(this),
        this.checkIntent.bind(this),
        this.dataset.bind(this),
        this.conversation.bind(this),
        this.afterAICustomFunction.bind(this),
        this.playMessage.bind(this),
      ])
    );

    this.initialDialogId = CHATGPT_WATERFALL;
  }

  async GPT(step) {
    const {
      OtherCases,
      Text,
      TextChatBot,
      TextNotMatch,
      Repeat,
      Name,
      Key,
      Retry,
      SentimentMain,
      MaxRepeat,
      NotFirstTime,
      Content,
      ContentChatBot,
    } = step._info.options;

    if (step._info.options.hasOwnProperty('BeforeCustomFunctions'))
      return await step.replaceDialog(VIRTUAL_AGENT_WATERFALL, step._info.options);

    if (Content || ContentChatBot) {
      return await this.askMultipleMessage(step);
    }

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    const { data, translateService, channelId, mediaSetting, flowData, defaultLanguage, conversationId, firstHit } =
      conversationData;
    const { flowId, flowName } = flowData.flowInfo[0];

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] ${Name} - Key: ${Key}`);

    const { LANGUAGE } = data;

    if (Retry && Repeat && Repeat <= 0) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Reached max not match times => go to not match case`
      );
      // not match case
      const OtherCase = OtherCases.find((otherCase) => otherCase.CaseOption === 'Not Match');

      conversationData.data = {
        ...conversationData.data,
        MAX_NOT_MATCH: !!!OtherCase,
      };

      return await step.endDialog(OtherCase);
    }

    let msg = '',
      notMatch = '',
      mainPrompt = '';
    let repeated = (MaxRepeat && Repeat && MaxRepeat - Repeat) || 0;

    if (!Retry) {
      step._info.options.MaxRepeat = Repeat;
    } else {
      notMatch = getPrompt(TextNotMatch, '', LANGUAGE, defaultLanguage, repeated - 1);

      notMatch.text = replaceStrWithParam(data, notMatch.text);

      notMatch.text = await translate(notMatch.text, notMatch.language, LANGUAGE, translateService);

      notMatch = formatMessage({
        message: notMatch.text,
        channelId,
        notMatch,
        mediaSetting,
        mediaName: SentimentMain,
        lang: LANGUAGE,
        allowSpeak: false,
      });

      const rsp = await step.context.sendActivity(notMatch);

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

    mainPrompt = getPrompt(TextChatBot, Text, LANGUAGE, defaultLanguage, repeated);

    mainPrompt.text = replaceStrWithParam(data, mainPrompt.text);

    mainPrompt.text = await translate(mainPrompt.text, mainPrompt.language, LANGUAGE, translateService);

    msg = mainPrompt.text;

    step._info.options.FirstPrompt = msg;

    if (NotFirstTime) return Dialog.EndOfTurn;

    msg = formatMessage({
      channelId,
      message: msg,
      mediaSetting,
      mediaName: SentimentMain,
      lang: LANGUAGE,
      allowSpeak: true,
    });

    return await step.prompt(GPT_PROMPT, msg);
  }

  async GPTDataset(step) {
    const {
      Name,
      Type,
      Repeat,
      Prompt,
      CustomTrain,
      ResponseMode,
      Temperature,
      NumberOutput,
      SentimentMain,
      IdDataset,
      KeepContext,
      NotFirstTime,
      FirstPrompt,
      Log,
      Key,
    } = step._info.options;

    let conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    const {
      channelId,
      mediaSetting,
      data,
      translateService,
      datasetSessionId,
      from,
      sender,
      recipient,
      companyId,
      callId,
      callFlowId,
      allowLogInfo,
      flowData,
      conversationId,
    } = conversationData;

    const { flowId, flowName } = flowData.flowInfo[0];

    const { LANGUAGE } = data;

    if (isFalse(CustomTrain)) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] CustomTrain : "${CustomTrain}" is disabled! => go to conversation step`
      );
      return await step.next(step.result);
    }

    const Directory = await getGPTDirectory(IdDataset);

    if (isFalse(Directory)) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Directory is empty => go to error handler flow`);

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.KNOWLEDGE_BASE.KB_DIRECTORY_EMPTY,
        ERROR_MESSAGE: `Directory is empty`,
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog();
    }

    let QAresponse = await qaChatGPT({
      directory: Directory,
      text: step.result,
      type: Type,
      prompt: replaceStrWithParam(data, Prompt),
      response_mode: ResponseMode,
      temperature: Temperature,
      num_output: NumberOutput,
      keep_context: !isFalse(KeepContext),
      session_id: datasetSessionId,
      first_prompt: (!NotFirstTime && FirstPrompt) || '',
    });

    if (!QAresponse || !QAresponse.data) {
      const json = JSON.stringify({
        Directory,
        userResponse: step.result,
        Type,
        Prompt,
        ResponseMode,
        Temperature,
        NumberOutput,
      });
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Call api GPT Dataset failed - data: ${json} => repeat`
      );

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.KNOWLEDGE_BASE.KB_EMPTY_RESPONSE,
        ERROR_MESSAGE: `Knowledge base response is empty`,
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog();
    }

    if (QAresponse.session_id) conversationData.datasetSessionId = QAresponse.session_id;

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
      content: `Action: ${Name} | User: ${step.result}| Virtual Agent: ${QAresponse.data}`,
      logType: 'info',
      actionName: Name,
      actionKey: Key,
      currentFlowId: flowId,
    });

    // translate to english for checking not understand
    const englishResponse = await translate(QAresponse.data, '', 'en', translateService);

    if (isNotUnderstand(englishResponse)) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [ChatGPT]  Predict dataset: not found solution => sub repeat variable and repeat gpt action`
      );
      return await step.replaceDialog(CHATGPT_WATERFALL, {
        ...step._info.options,
        Retry: true,
        Repeat: Repeat - 1,
        NotFirstTime: true,
      });
    }

    let msg = QAresponse.data;

    msg = formatMessage({
      channelId,
      message: msg,
      mediaSetting,
      mediaName: SentimentMain,
      lang: LANGUAGE,
      allowSpeak: false,
    });

    const rsp = await step.context.sendActivity(msg);

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

    // continue GPT step
    console.log(`[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Play prompt of dataset => repeat gpt action`);

    return await step.replaceDialog(CHATGPT_WATERFALL, {
      ...step._info.options,
      Repeat: step._info.options.MaxRepeat,
      Retry: false,
      NotFirstTime: true,
    });
  }

  async GPTConversation(step) {
    let conversationData = await this.dialog.conversationDataAccessor.get(step.context);
    const {
      ChatGPTSessionId,
      mediaSetting,
      channelId,
      data,
      translateService,
      from,
      sender,
      recipient,
      companyId,
      callId,
      callFlowId,
      allowLogInfo,
      conversationId,
      flowData,
    } = conversationData;

    const { flowId, flowName } = flowData.flowInfo[0];

    const { LANGUAGE } = data;

    const { SentimentMain, Repeat, Log, Name, Key } = step._info.options;

    let gptResponse = await GPTChatService(ChatGPTSessionId, step.result);

    if (!gptResponse || !gptResponse.data) {
      const bodyStr = JSON.stringify({
        ChatGPTSessionId,
        userResponse: step.result,
      });
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Call api GPT Conversation failed - data: ${bodyStr} => Ask again (Retry)`
      );

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.KNOWLEDGE_BASE.KB_EMPTY_RESPONSE,
        ERROR_MESSAGE: `Knowledge base response is empty`,
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog();
    }

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
      content: `Action: ${Name} | User: ${step.result}| Virtual Agent: ${gptResponse.data}`,
      logType: 'info',
      actionName: Name,
      actionKey: Key,
      currentFlowId: flowId,
    });

    conversationData.ChatGPTSessionId = gptResponse.session_id;

    const englishResponse = await translate(gptResponse.data, '', 'en', translateService);

    if (isNotUnderstand(englishResponse)) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Conversation: not found solution => sub repeat variable and repeat gpt action`
      );
      return await step.replaceDialog(CHATGPT_WATERFALL, {
        ...step._info.options,
        Retry: true,
        Repeat: Repeat - 1,
        NotFirstTime: true,
      });
    }

    let msg = gptResponse.data;

    msg = formatMessage({
      channelId,
      message: msg,
      mediaSetting,
      SentimentMain,
      lang: LANGUAGE,
      allowSpeak: false,
    });

    const rsp = await step.context.sendActivity(msg);

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

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Play prompt GPT conversation => repeat GPT action`);
    return await step.replaceDialog(CHATGPT_WATERFALL, {
      ...step._info.options,
      Repeat: step._info.options.MaxRepeat,
      Retry: false,
      NotFirstTime: true,
    });
  }

  async ask(step) {
    const {
      OtherCases,
      Text,
      TextChatBot,
      TextNotMatch,
      Repeat,
      Name,
      Key,
      Retry,
      SentimentMain,
      MaxRepeat,
      NotFirstTime,
      Content,
      ContentChatBot,
    } = step._info.options;

    if (Content || ContentChatBot) {
      return await this.askMultipleMessage(step);
    }

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    const {
      data,
      translateService,
      channelId,
      mediaSetting,
      flowData,
      defaultLanguage,
      conversationId,
      firstHit,
      serviceRequestTimeout,
    } = conversationData;
    const { flowId, flowName } = flowData.flowInfo[0];

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] ${Name} - Key: ${Key}`);

    const { LANGUAGE } = data;

    if (Retry && Repeat && Repeat <= 0) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Reached max not match times => go to not match case`
      );
      // not match case
      const OtherCase = OtherCases.find((otherCase) => otherCase.CaseOption === 'Not Match');

      conversationData.data = {
        ...conversationData.data,
        MAX_NOT_MATCH: !!!OtherCase,
      };

      return await step.endDialog(OtherCase);
    }

    let msg = '',
      notMatch = '',
      mainPrompt = '';
    let repeated = (MaxRepeat && Repeat && MaxRepeat - Repeat) || 0;

    if (!Retry) {
      step._info.options.MaxRepeat = Repeat;
    } else {
      notMatch = getPrompt(TextNotMatch, '', LANGUAGE, defaultLanguage, repeated - 1);

      notMatch.text = replaceStrWithParam(data, notMatch.text);

      notMatch.text = await translate(notMatch.text, notMatch.language, LANGUAGE, translateService, serviceRequestTimeout);

      notMatch = formatMessage({
        message: notMatch.text,
        channelId,
        notMatch,
        mediaSetting,
        mediaName: SentimentMain,
        lang: LANGUAGE,
        allowSpeak: false,
      });

      const rsp = await step.context.sendActivity(notMatch);

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

    mainPrompt = getPrompt(TextChatBot, Text, LANGUAGE, defaultLanguage, repeated);

    mainPrompt.text = replaceStrWithParam(data, mainPrompt.text);

    mainPrompt.text = await translate(
      mainPrompt.text,
      mainPrompt.language,
      LANGUAGE,
      translateService,
      serviceRequestTimeout
    );

    msg = mainPrompt.text;

    step._info.options.FirstPrompt = msg;

    if (NotFirstTime) return Dialog.EndOfTurn;

    if (!msg && step.context.activity.text && firstHit) return await step.next(step.context.activity.text);

    msg = formatMessage({
      channelId,
      message: msg,
      mediaSetting,
      mediaName: SentimentMain,
      lang: LANGUAGE,
      allowSpeak: true,
    });

    return await step.prompt(GPT_PROMPT, msg);
  }

  async askMultipleMessage(step) {
    const {
      OtherCases,
      ContentNotMatch,
      Repeat,
      Name,
      Key,
      Retry,
      SentimentMain,
      MaxRepeat,
      NotFirstTime,
      Content,
      ContentChatBot,
      AllowAnswerOption,
      AnswerOptionType,
      Answer,
      AnswerCustom,
      InterruptAction,
    } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    conversationData.interruptAction = InterruptAction !== 'notAllow';

    const {
      data,
      translateService,
      channelId,
      mediaSetting,
      flowData,
      defaultLanguage,
      conversationId,
      firstHit,
      serviceRequestTimeout,
    } = conversationData;
    const { flowId, flowName } = flowData.flowInfo[0];

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] ${Name} - Key: ${Key}`);

    const { LANGUAGE } = data;

    if (Retry && Repeat && Repeat <= 0) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Reached max not match times => go to not match case`
      );
      // not match case
      const OtherCase = OtherCases.find((otherCase) => otherCase.CaseOption === 'Not Match');

      conversationData.data = {
        ...conversationData.data,
        MAX_NOT_MATCH: !!!OtherCase,
      };

      return await step.endDialog(OtherCase);
    }

    let notMatchMessages = [],
      mainPrompts = [];
    let repeated = (MaxRepeat && Repeat && MaxRepeat - Repeat) || 0;

    if (!Retry) {
      step._info.options.MaxRepeat = Repeat;
    } else {
      notMatchMessages = getPromptMultipleMessage(ContentNotMatch, '', LANGUAGE, defaultLanguage, repeated - 1);

      if (notMatchMessages.length) {
        for (let msg of notMatchMessages) {
          if (msg.type == 'text') {
            msg.value = replaceStrWithParam(data, msg.value);
            msg.value = await translate(msg.value, msg.language, LANGUAGE, translateService, serviceRequestTimeout);
          }

          let contentNotMatch = formatMultipleMessage({
            ...step._info.options,
            channelId,
            message: msg,
            mediaSetting,
            mediaName: SentimentMain,
            lang: LANGUAGE,
            allowSpeak: true,
          });

          const rsp = await step.context.sendActivity(contentNotMatch);

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

    // not first time => end turn & not asking
    if (NotFirstTime) return Dialog.EndOfTurn;

    mainPrompts = getPromptMultipleMessage(ContentChatBot, Content, LANGUAGE, defaultLanguage, repeated);

    if ((!Array.isArray(mainPrompts) || !mainPrompts.length) && step.context.activity.text && firstHit) {
      return await step.next(step.context.activity.text);
    }

    step._info.options.FirstPrompt = '';

    let buttons = new Buttons({
      AllowAnswerOption,
      AnswerOptionType,
      data,
      defaultLanguage,
      Answer,
      AnswerCustom,
      channelId,
      service: translateService,
    });
    let buttonsContent = await buttons.formatButtons();

    for (let [i, mp] of mainPrompts.entries()) {
      mp.value = replaceStrWithParam(data, mp.value);
      if (mp.type == 'text') {
        mp.value = await translate(mp.value, mp.language, LANGUAGE, translateService, serviceRequestTimeout);
        step._info.options.FirstPrompt += ` ${mp.value}`;
        if (!mp.value.endsWith('.')) step._info.options.FirstPrompt += '.';
      }

      let contentMessage = formatMultipleMessage({
        ...step._info.options,
        channelId,
        message: mp,
        mediaSetting,
        mediaName: SentimentMain,
        lang: LANGUAGE,
        allowSpeak: true,
      });

      if (
        i === mainPrompts.length - 1 &&
        buttonsContent &&
        buttonsContent.channelData &&
        buttonsContent.channelData.buttons
      ) {
        contentMessage.channelData.buttons = [...buttonsContent.channelData.buttons];
      }

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

    step._info.options.FirstPrompt = step._info.options.FirstPrompt.trim();
    if (step._info.options.FirstPrompt.endsWith('.'))
      step._info.options.FirstPrompt = step._info.options.FirstPrompt.slice(0, -1);

    return Dialog.EndOfTurn;
  }

  async beforeAICustomFunction(step) {
    const {
      BeforeCustomFunctions,
      Name,
      OptionCases,
      MaxRepeat,
      EnableCheckpoint,
      IdDataset,
      Prompt,
      Temperature,
      NumberOutput,
      Type,
      ResponseMode,
      KeepContext,
      NotFirstTime,
      FirstPrompt,
      CustomTrain,
      Log,
      Key,
      TopK,
      TopP,
      LlmModel,
      SimilarityCutOff,
      PresencePenalty,
      FrequencyPenalty,
      ReplyType,
      ContentNotMatch,
    } = step._info.options;

    const { value, title } = step.context.activity.data || {};

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    conversationData.interruptAction = true;

    const {
      flowData,
      conversationId,
      channelId,
      data,
      datasetSessionId,
      from,
      sender,
      recipient,
      companyId,
      callId,
      allowLogInfo,
      callFlowId,
      serviceRequestTimeout,
      defaultLanguage,
    } = conversationData;
    const { flowId, flowName } = flowData.flowInfo[0];

    const functions = tryParseJSON(BeforeCustomFunctions);

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
      content: `Action: ${Name} | User: ${value || step.context.activity.text}`,
      logType: 'info',
      actionName: Name,
      actionKey: Key,
      currentFlowId: flowId,
      timeout: serviceRequestTimeout,
    });

    let request = {};

    if (isFalse(CustomTrain)) {
      request = {
        input: value || step.result,
        prompt: replaceStrWithParam(data, Prompt),
        language: conversationData.data.LANGUAGE && conversationData.data.LANGUAGE.split('-')[0],
        session_id: datasetSessionId || '',
        keep_context: !isFalse(KeepContext),
        model: LlmModel,
        model_config: {
          temperature: Temperature || 0.3,
          max_tokens: NumberOutput || 512,
          top_p: TopP || 1,
          frequency_penalty: parseFloat(FrequencyPenalty) || 0,
          presence_penalty: parseFloat(PresencePenalty) || 0,
          response_format: 'text',
        },
        ...((!NotFirstTime && FirstPrompt && { first_prompt: FirstPrompt }) || {}),
      };
    } else {
      const { extenData: Directory, model } = await getDataset(IdDataset, serviceRequestTimeout);

      if (isFalse(Directory)) {
        console.log(
          `[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Directory is empty => go to error handler flow`
        );

        conversationData.runErrorFlow = true;

        conversationData.data = {
          ...conversationData.data,
          ERROR_CODE: ERROR_CODES.KNOWLEDGE_BASE.KB_DIRECTORY_EMPTY,
          ERROR_MESSAGE: `Directory is empty`,
          CURRENT_ACTION_NAME: Name,
        };

        return await step.endDialog();
      }

      const notMatchPrompts = getAllTextPrompts(
        ContentNotMatch,
        conversationData.data.LANGUAGE && conversationData.data.LANGUAGE.split('-')[0],
        conversationData.data.DEFAULT_LANGUAGE
      );

      request = {
        input: value || step.result,
        ref_id: Directory,
        model: LlmModel,
        training_model: model || 'text-embedding-ada-002',
        prompt: replaceStrWithParam(data, Prompt),
        keep_context: !isFalse(KeepContext),
        session_id: datasetSessionId || '',
        language: conversationData.data.LANGUAGE && conversationData.data.LANGUAGE.split('-')[0],
        model_config: {
          temperature: Temperature || 0.3,
          max_tokens: NumberOutput || 512,
          top_p: TopP || 1,
          frequency_penalty: parseFloat(FrequencyPenalty) || 0,
          presence_penalty: parseFloat(PresencePenalty) || 0,
          response_format: 'text',
        },
        retrieval_config: {
          similarity_cutoff: (parseFloat(SimilarityCutOff) && parseFloat(SimilarityCutOff) / 100) || 0.5,
          similarity_top_k: +TopK && +TopK <= 0 ? 3 : +TopK,
          no_recall_reply_mode: ReplyType || 'default',
          no_recall_reply_customize_prompts: notMatchPrompts,
        },
        ...((!NotFirstTime && FirstPrompt && { first_prompt: FirstPrompt }) || {}),
      };
    }

    let rs = request;

    if (!Array.isArray(functions) || !functions.length || !isFalse(EnableCheckpoint)) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Function list is empty => check intent step`);

      return await step.next(rs);
    }

    for (let f of functions) {
      try {
        const { id, name } = f;

        console.log(
          `[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Checking before AI function ${name} - Id : ${id}`
        );

        // get details
        const details = await getFunctionDetails(id, serviceRequestTimeout);

        const { code, codeFormat, companyId, language, name: FunctionName, param } = details;

        let { data, result, error } = await CustomFunction({
          FunctionId: id,
          FunctionName: FunctionName,
          CompanyId: companyId,
          Code: code,
          FormattedCode: codeFormat,
          CodeLanguage: language,
          Params: (param && { [param.split('|')[0]]: request }) || {},
          ConversationData: conversationData.data,
          timeout: serviceRequestTimeout,
        });

        if (error) throw error;

        if (data && typeof data === 'object') {
          conversationData.data = {
            ...conversationData.data,
            ...data,
          };
        }

        rs = result;
      } catch (e) {
        console.log(
          `[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] handle function error ${e.message} => error handler`
        );

        conversationData.runErrorFlow = true;

        conversationData.data = {
          ...conversationData.data,
          ERROR_CODE: e.ERROR_CODE || ERROR_CODES.FUNCTION_FAILED,
          ERROR_MESSAGE: e.ERROR_MESSAGE || e.message,
          CURRENT_ACTION_NAME: Name,
        };

        return await step.endDialog();
      }

      if ((!rs && rs !== 0) || Array.isArray(rs)) {
        console.log(
          `[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Function result return falsies or array => go to success case`
        );
        const SuccessCase = OptionCases.find((c) => c.CaseOption === 'Success');
        return await step.endDialog(SuccessCase);
      }

      if (typeof rs === 'object' && !rs.message && rs.message !== 0) {
        if (rs.input && typeof rs.input === 'string') {
          rs.input = replaceStrWithParam(data, rs.input) || rs.input;
        }

        if (rs.prompt && typeof rs.prompt === 'string') {
          rs.prompt = replaceStrWithParam(data, rs.prompt);
        }

        return await step.next(rs);
      }

      if (typeof rs === 'string') {
        rs = {
          message: rs,
        };
      }

      const msg = await formatMessage({
        channelId,
        message: replaceStrWithParam(conversationData.data, String(rs.message)),
        lang: conversationData.data.LANGUAGE,
        allowSpeak: false,
      });

      let buttons = new Buttons({
        data: conversationData.data,
        service: conversationData.translateService,
        defaultLanguage: defaultLanguage,
        timeout: serviceRequestTimeout,
      });

      rs.buttons = buttons.handleCustomButtons(rs.buttons);

      msg.channelData.buttons =
        (await buttons.getButtons(rs.buttons, conversationData.data.LANGUAGE, defaultLanguage)) || [];

      const rsp = await step.context.sendActivity(msg);

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

      return await step.replaceDialog(VIRTUAL_AGENT_WATERFALL, {
        ...step._info.options,
        Repeat: MaxRepeat,
        Retry: false,
        NotFirstTime: true,
      });
    }

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] No function return false => check intent step`);

    return await step.next(step.result);
  }

  async checkIntent(step) {
    const {
      Name,
      GrammarName,
      EnableCheckpoint,
      Attribute,
      EntityAttribute,
      UserResponse,
      IdGrammar,
      GrammarArray,
      Sentiment,
      Log,
      Key,
    } = step._info.options;

    let conversationData = await this.dialog.conversationDataAccessor.get(step.context);
    const {
      companyId,
      callFlowId,
      sender,
      data,
      translateService,
      from,
      recipient,
      callId,
      allowLogInfo,
      flowData,
      conversationId,
      serviceRequestTimeout,
    } = conversationData;

    const { flowId, flowName } = flowData.flowInfo[0];

    const { value, title } = step.context.activity.data || {};

    const { LANGUAGE, DEFAULT_LANGUAGE } = data;

    const grammarArray = tryParseJSON(GrammarArray);

    if (UserResponse) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Save user input "${step.context.activity.text}" to "${UserResponse}"`
      );

      conversationData.data = {
        ...conversationData.data,
        [UserResponse]: value || step.context.activity.text,
      };
    }

    if (isFalse(EnableCheckpoint) || ((!grammarArray || !grammarArray.length) && isFalse(IdGrammar))) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Not enabled checking grammar => go to db step`);
      return await step.next(step.result);
    }

    let result = {};

    try {
      result = await checkMultipleGrammars({
        GrammarArray,
        input: value || step.context.activity.text,
        translateService,
        companyId,
        callFlowId,
        sender,
        defaults: [{ type: 'Custom', name: GrammarName, id: IdGrammar }],
        LANGUAGE,
        data: conversationData.data,
        DEFAULT_LANGUAGE,
        timeout: serviceRequestTimeout,
      });
    } catch (e) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Check grammar failed ${e.message} => go to error handler`
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

    const { intent, entity, notMatches, sentiment, passedGrammar } = result;

    if (!intent) {
      if (Array.isArray(notMatches) && notMatches.length) {
        logRecognizeNoIntent({
          companyId,
          callFlowId,
          callId,
          text: step.result,
          responseList: notMatches,
        });
      }
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Found no intents => go to db step`);
      return await step.next(step.result);
    }

    if (!isFalse(Attribute)) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Set attribute - ${Attribute} = ${intent}`);
      conversationData.data = {
        ...conversationData.data,
        [Attribute]: intent,
      };
    }

    if (!isFalse(EntityAttribute) && entity) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Set Entity - ${EntityAttribute} = ${JSON.stringify(entity)}`
      );
      conversationData.data = {
        ...conversationData.data,
        [EntityAttribute]: entity,
      };
    }

    if (!isFalse(Sentiment) && sentiment) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Set attribute - ${Sentiment} = ${sentiment}`);
      conversationData.data = {
        ...conversationData.data,
        [Sentiment]: sentiment,
      };
    }

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
      content: `Action: ${Name} | Grammar: ${passedGrammar} | User: ${
        step.context.activity.text
      } | Intent: ${intent} | Entity: ${formatEntitiesLog(entity)}`,
      logType: 'info',
      actionName: Name,
      actionKey: Key,
      currentFlowId: flowId,
      timeout: serviceRequestTimeout,
    });

    console.log(
      `[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] User intent existed : ${intent} - Check and go to next action!`
    );

    return await step.endDialog({
      ...step._info.options,
      CheckForNextCase: true,
      AttributeToCheck: Attribute,
      ValueCheckNextCase: isFalse(Attribute) && intent,
    });
  }

  async dataset(step) {
    const { Name, CustomTrain, IdDataset, Log, Key, Type } = step._info.options;

    let conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    const {
      data,
      from,
      sender,
      recipient,
      companyId,
      callId,
      callFlowId,
      allowLogInfo,
      flowData,
      conversationId,
      serviceRequestTimeout,
    } = conversationData;

    const { flowId, flowName } = flowData.flowInfo[0];

    if (isFalse(CustomTrain)) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] CustomTrain : "${CustomTrain}" is disabled! => go to conversation step`
      );

      return await step.next(step.result);
    }

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
      content: `Request Body`,
      logType: 'info',
      actionName: Name,
      actionKey: Key,
      currentFlowId: flowId,
      jsonRefData: { ...step.result },
      timeout: serviceRequestTimeout,
    });

    const knowledge = await queryKnowledge({ ...step.result }, Type, serviceRequestTimeout);

    if (!knowledge || !knowledge.success) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Call api GPT Dataset failed - data: ${JSON.stringify(
          step.result
        )} => error handler`
      );

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.KNOWLEDGE_BASE.KB_EMPTY_RESPONSE,
        ERROR_MESSAGE: `Knowledge base response is empty`,
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog();
    }

    conversationData.datasetSessionId = knowledge.session_id || '';

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
      content: `Response Body`,
      logType: 'info',
      actionName: Name,
      actionKey: Key,
      currentFlowId: flowId,
      jsonRefData: { ...knowledge },
      timeout: serviceRequestTimeout,
    });

    console.log(
      `[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Play prompt GPT conversation => go to check custom function`
    );

    return await step.next({ response: knowledge, request: step.result });
  }

  async conversation(step) {
    const { Prompt, Log, Name, CustomTrain, Key } = step._info.options;

    let conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    const {
      data,
      from,
      sender,
      recipient,
      companyId,
      callId,
      callFlowId,
      allowLogInfo,
      conversationId,
      flowData,
      serviceRequestTimeout,
    } = conversationData;

    const { flowId, flowName } = flowData.flowInfo[0];

    if (!isFalse(CustomTrain)) return await step.next(step.result);

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
      content: `Request Body`,
      logType: 'info',
      actionName: Name,
      actionKey: Key,
      currentFlowId: flowId,
      jsonRefData: { ...step.result },
      timeout: serviceRequestTimeout,
    });

    let gptResponse = await gptConversation(step.result, serviceRequestTimeout);

    if (!gptResponse || !gptResponse.success) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Call api GPT Conversation failed - data: ${step.result} => error handler`
      );

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.KNOWLEDGE_BASE.KB_EMPTY_RESPONSE,
        ERROR_MESSAGE: `Knowledge base response is empty`,
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog();
    }

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
      content: `Response Body`,
      logType: 'info',
      actionName: Name,
      actionKey: Key,
      currentFlowId: flowId,
      jsonRefData: { ...gptResponse },
      timeout: serviceRequestTimeout,
    });

    conversationData.datasetSessionId = gptResponse.session_id || '';

    console.log(
      `[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Play prompt GPT conversation => go to check custom function`
    );

    return await step.next({ request: step.result, response: gptResponse });
  }

  async afterAICustomFunction(step) {
    const { AfterCustomFunctions, Name, OptionCases, EnableCheckpoint } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    const { flowData, conversationId, serviceRequestTimeout } = conversationData;
    const { flowId, flowName } = flowData.flowInfo[0];

    const functions = tryParseJSON(AfterCustomFunctions);

    if (!Array.isArray(functions) || !functions.length || !isFalse(EnableCheckpoint)) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Function list is empty => go to play message step`
      );

      return await step.next(step.result.response.data);
    }

    let rs;

    for (let f of functions) {
      try {
        const { id, name } = f;

        console.log(
          `[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Checking after AI function ${name} - Id : ${id}`
        );

        // get details
        const details = await getFunctionDetails(id, serviceRequestTimeout);

        const { code, codeFormat, companyId, language, name: FunctionName, param } = details;

        const [request, response] = param.split('|');

        let { data, result, error } = await CustomFunction({
          FunctionId: id,
          FunctionName: FunctionName,
          CompanyId: companyId,
          Code: code,
          FormattedCode: codeFormat,
          CodeLanguage: language,
          Params: {
            [request]: step.result.request,
            [response]: step.result.response,
          },
          ConversationData: conversationData.data,
          timeout: serviceRequestTimeout,
        });

        if (error) throw error;

        if (data && typeof data === 'object') {
          conversationData.data = {
            ...conversationData.data,
            ...data,
          };
        }

        rs = result;
      } catch (e) {
        console.log(
          `[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] handle after AI function error ${e.message} => error handler`
        );

        conversationData.runErrorFlow = true;

        conversationData.data = {
          ...conversationData.data,
          ERROR_CODE: e.ERROR_CODE || ERROR_CODES.FUNCTION_FAILED,
          ERROR_MESSAGE: e.ERROR_MESSAGE || e.message,
          CURRENT_ACTION_NAME: Name,
        };

        return await step.endDialog();
      }

      if (rs === false) {
        console.log(
          `[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] Checking after AI returned false => go to next case`
        );

        const SuccessCase = OptionCases.find((c) => c.CaseOption === 'Success');

        return await step.endDialog(SuccessCase);
      }
    }

    return await step.next(rs);
  }

  async playMessage(step) {
    const { MaxRepeat, Name, OptionCases, SentimentMain, Log, Key } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    const {
      mediaSetting,
      channelId,
      data,
      from,
      sender,
      recipient,
      companyId,
      callId,
      callFlowId,
      allowLogInfo,
      conversationId,
      flowData,
      serviceRequestTimeout,
      defaultLanguage,
    } = conversationData;

    const { flowId, flowName } = flowData.flowInfo[0];

    if (
      (!step.result && !step.result !== 0) ||
      (typeof step.result === 'object' && !step.result.message && step.result.message !== 0)
    ) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [ChatGPT] no message found => go to success case`);

      const SuccessCase = OptionCases.find((c) => c.CaseOption === 'Success');

      return await step.endDialog(SuccessCase);
    }

    const reply = typeof step.result === 'object' ? step.result.message : step.result;

    const msg = await formatMessage({
      channelId,
      message: replaceStrWithParam(conversationData.data, String(reply)),
      mediaSetting,
      SentimentMain,
      lang: data.LANGUAGE,
      allowSpeak: false,
    });

    if (step.result.buttons) {
      let buttons = new Buttons({
        data: conversationData.data,
        service: conversationData.translateService,
        defaultLanguage: defaultLanguage,
      });

      step.result.buttons = buttons.handleCustomButtons(step.result.buttons);

      msg.channelData.buttons =
        (await buttons.getButtons(
          step.result.buttons,
          conversationData.data.LANGUAGE,
          conversationData.data.DEFAULT_LANGUAGE
        )) || [];
    }

    const rsp = await step.context.sendActivity(msg);

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
      content: `Action: ${Name} | Agent: ${msg.text}`,
      logType: 'info',
      actionName: Name,
      actionKey: Key,
      currentFlowId: flowId,
      timeout: serviceRequestTimeout,
    });

    return await step.replaceDialog(VIRTUAL_AGENT_WATERFALL, {
      ...step._info.options,
      Repeat: MaxRepeat,
      Retry: false,
      NotFirstTime: true,
    });
  }
}

module.exports = {
  ChatGPTDialog,
};
