const { ComponentDialog, WaterfallDialog } = require('botbuilder-dialogs');
const { AI, callflowLog } = require('../services');

const { LLM_DIALOG, ERROR_CODES } = require('../constant');
const { assignValueToObject, replaceStrWithParam, isFalse } = require('../util/helper');

const LLM_WATERFALL = 'LLM_WATERFALL';

class LLMsDialog extends ComponentDialog {
  constructor(dialog) {
    super(LLM_DIALOG);
    this.dialog = dialog;

    this.addDialog(new WaterfallDialog(LLM_WATERFALL, [this.handleLLM.bind(this)]));

    this.initialDialogId = LLM_WATERFALL;
  }

  // ask
  async handleLLM(step) {
    const {
      OtherCases,
      Model,
      Temperature,
      NumberOutput,
      FrequencyPenalty,
      PresencePenalty,
      ResponseFormat,
      Prompt,
      Text,
      Attribute,
      Key,
      Name,
      LlmModel,
      TopP,
    } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    const {
      data,
      flowData,
      from,
      sender,
      recipient,
      companyId,
      callId,
      callFlowId,
      allowLogInfo,
      conversationId,
      serviceRequestTimeout,
    } = conversationData;

    const { flowId, flowName } = flowData.flowInfo[0];

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [LLM] ${Name} - Key: ${Key}`);

    if (!Model || !Text) {
      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.LLM.LLM_INPUT_EMPTY,
        ERROR_MESSAGE: `Model or Input is empty`,
        CURRENT_ACTION_NAME: Name,
      };

      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [LLM] - Missing required parameters - params: ${JSON.stringify({
          Model,
          Text,
          Attribute,
        })} => go to other case`
      );

      return await step.endDialog(OtherCases);
    }

    let output, err;

    let input = replaceStrWithParam(conversationData.data, Text);
    let prompt = replaceStrWithParam(conversationData.data, Prompt);

    if (!input) {
      console.log(`Action LLMs empty input => go to other case`);

      return await step.endDialog(OtherCases);
    }

    if (Model === 'gpt') {
      let { result, error } = await AI.gptLLM({
        Model: LlmModel,
        Text: input,
        TopP: TopP,
        Temperature,
        Prompt: prompt,
        NumberOutput,
        FrequencyPenalty,
        PresencePenalty,
        ResponseFormat,
        timeout: serviceRequestTimeout,
      });
      output = result;
      err = error;
    }

    if (Model === 'gemini') {
      let { result, error } = await AI.geminiLLM({
        Text: input,
        Temperature,
        Prompt: prompt,
        timeout: serviceRequestTimeout,
      });
      output = result;
      err = error;
    }

    if (err || !output) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [LLM] Call API failed => go to other case!`);

      if (err) {
        conversationData.runErrorFlow = true;

        conversationData.data = {
          ...conversationData.data,
          ERROR_CODE: Model === 'gpt' ? ERROR_CODES.GPT_FAILED : ERROR_CODES.GEMINI_FAILED,
          ERROR_MESSAGE: `Call API LLMs failed: ${err.message}`,
          CURRENT_ACTION_NAME: Name,
        };
      }

      await callflowLog.traceLog({
        from,
        sender,
        recipient,
        companyId,
        callId,
        callFlowId,
        data,
        allowLogInfo,
        content: `Action : ${Name} | Error: Call LLM failed - ${(err && err.message) || `LLM response empty`}`,
        logType: 'error',
        actionName: Name,
        actionKey: Key,
        currentFlowId: flowId,
        timeout: serviceRequestTimeout,
        jsonRefData: {
          model: LlmModel || 'gpt-4o-mini',
          input: input,
          temperature: Temperature || 0.3,
          prompt: prompt,
          max_tokens: NumberOutput || 512,
          frequency_penalty: FrequencyPenalty || 0,
          presence_penalty: PresencePenalty || 0,
          response_format: ResponseFormat || 'text',
          top_p: TopP,
        },
      });

      return await step.endDialog(OtherCases);
    }

    if (Attribute) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [LLM] Assign ${output} to ${Attribute}`);
      assignValueToObject(conversationData.data, Attribute, output);
    }

    await callflowLog.traceLog({
      from,
      sender,
      recipient,
      companyId,
      callId,
      callFlowId,
      data,
      allowLogInfo,
      content: `LLM Response: ${output}`,
      logType: 'info',
      actionName: Name,
      actionKey: Key,
      currentFlowId: flowId,
      timeout: serviceRequestTimeout,
      jsonRefData: {
        model: LlmModel || 'gpt-4o-mini',
        input: input,
        temperature: Temperature || 0.3,
        prompt: prompt,
        max_tokens: NumberOutput || 512,
        frequency_penalty: FrequencyPenalty || 0,
        presence_penalty: PresencePenalty || 0,
        response_format: ResponseFormat || 'text',
        top_p: TopP,
      },
    });

    console.log(
      `[${conversationId} - ${flowId} - ${flowName}] [LLM] service return result: ${output} => check for next case!`
    );

    return await step.endDialog({
      ...step._info.options,
      CheckForNextCase: true,
      AttributeToCheck: Attribute,
      ValueCheckNextCase: isFalse(Attribute) && output,
    });
  }
}

module.exports = {
  LLMsDialog,
};
