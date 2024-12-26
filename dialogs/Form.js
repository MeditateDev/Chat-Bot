const { ComponentDialog, TextPrompt, WaterfallDialog } = require('botbuilder-dialogs');

const { FORM_DIALOG } = require('../constant');
const translate = require('../services/translate');
const { CustomActivityTypes } = require('../classes/CustomActivityTypes');
const { checkMultipleGrammars } = require('../services/grammars');
const { logRecognizeNoIntent, traceLog } = require('../services/callflowLog');
const { replaceStrWithParam } = require('../util/helper');

const FORM_PROMPT = 'FORM_PROMPT';
const FORM_WATERFALL = 'FORM_WATERFALL';

class FormDialog extends ComponentDialog {
  constructor(dialog) {
    super(FORM_DIALOG);
    this.dialog = dialog;

    this.addDialog(new TextPrompt(FORM_PROMPT));

    this.addDialog(
      new WaterfallDialog(FORM_WATERFALL, [
        this.sendForm.bind(this),
        this.validateData.bind(this),
        this.handleData.bind(this),
      ])
    );

    this.initialDialogId = FORM_WATERFALL;
  }

  async sendForm(step) {
    const {
      Title,
      Description,
      ButtonLabel,
      ErrorMessage,
      Skip,
      SkipButtonLabel,
      MarkRequiredFields,
      Questions,
      Name,
      Key,
      OtherCases,
      errors,
      Option,
    } = step._info.options;

    if (errors && errors.length) {
      await step.context.sendActivity({
        type: CustomActivityTypes.ValidateResult,
        channelData: { valid: false, errors },
      });
      return await step.prompt(FORM_PROMPT, {});
    }

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    conversationData.interruptAction = false;

    const {
      flowData,
      companyId,
      callFlowId,
      callId,
      recipient,
      sender,
      data,
      translateService,
      defaultLanguage,
      conversationId,
      serviceRequestTimeout,
    } = conversationData;
    const { flowId, flowName } = flowData.flowInfo[0];
    const { LANGUAGE } = data;

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [FORMS] ${Name} - Key: ${Key}`);

    try {
      // option URL
      if (Option == 2) {
        const { Url, Cases } = step._info.options;

        if (!Url)
          console.log(`[${conversationId} - ${flowId} - ${flowName}] [FORMS] Can not get URL form => go to success case`);
        else await step.context.sendActivity(Url);

        return await step.endDialog(Cases);
      }

      // Option Custom
      let questions = JSON.parse(Questions);
      for (let question of questions) {
        if (question.defaultValue)
          try {
            question.defaultValue = JSON.parse(replaceStrWithParam(data, question.defaultValue));
          } catch (e) {
            question.defaultValue = replaceStrWithParam(data, question.defaultValue);
          }
      }

      step._info.options.Questions = questions;
      let translatedTitle = await this.getTranslated(
        Title,
        LANGUAGE,
        defaultLanguage,
        translateService,
        serviceRequestTimeout
      );
      let translatedDescription = await this.getTranslated(
        Description,
        LANGUAGE,
        defaultLanguage,
        translateService,
        serviceRequestTimeout
      );
      let description = JSON.parse(Description);
      await traceLog({
        sender,
        recipient,
        companyId,
        callId,
        callFlowId,
        data,
        allowLogInfo: true,
        content: `Form title: ${translatedTitle} | Form description: ${translatedDescription} | Form:`,
        jsonRefData: {
          description,
          questions,
        },
        logType: 'info',
        actionName: 'Information Form',
        currentFlowId: flowId,
      });

      return await step.prompt(FORM_PROMPT, {
        type: CustomActivityTypes.Form,
        channelData: {
          Title: translatedTitle,
          Description: translatedDescription,
          Skip,
          SkipButtonLabel,
          ButtonLabel,
          ErrorMessage,
          Questions: questions,
          MarkRequiredFields,
        },
      });
    } catch (e) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [FORMS] Parse form questions error: ${e.message} - Data ${Questions} => go to other case`
      );

      return await step.endDialog(OtherCases);
    }
  }

  async validateData(step) {
    const { Cases, OtherCases, Questions, Skip } = step._info.options;

    const { data: formData } = step.context.activity;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    conversationData.interruptAction = true;

    const {
      companyId,
      recipient,
      callFlowId,
      sender,
      translateService,
      data,
      callId,
      conversationId,
      flowData,
      serviceRequestTimeout,
    } = conversationData;
    const { flowId, flowName } = flowData.flowInfo[0];
    const { LANGUAGE, DEFAULT_LANGUAGE } = data;

    if (!Array.isArray(Questions)) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [FORMS] Invalid questions type : ${JSON.stringify(
          Questions
        )}  => go to other case`
      );
      return await step.endDialog(OtherCases);
    }
    if (!formData || Object.keys(formData).length === 0) {
      if (Skip) {
        await traceLog({
          sender,
          recipient,
          companyId,
          callId,
          callFlowId,
          data: conversationData.data,
          allowLogInfo: true,
          content: `User skipped the form.`,
          logType: 'info',
          actionName: 'Form Skipped',
          currentFlowId: flowId,
        });
        console.log(`[${conversationId} - ${flowId} - ${flowName}] [FORMS] User skipped the form  => go to other case`);
        return step.endDialog(OtherCases);
      }
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [FORMS] Can not get user form data => go to other case`);
      return await step.endDialog(OtherCases);
    }

    let errors = [];

    for (const question of Questions) {
      const { grammar, answerVariable, validationErrorMessage, isRequired } = question;

      try {
        if (!grammar.length || (!isRequired && !formData[answerVariable]) || !answerVariable) continue;

        const { intent, notMatches } = await checkMultipleGrammars({
          GrammarArray: JSON.stringify(grammar),
          input: formData[answerVariable],
          translateService,
          companyId,
          callFlowId,
          sender,
          LANGUAGE,
          data: conversationData.data,
          DEFAULT_LANGUAGE,
          timeout: serviceRequestTimeout,
        });

        if (!intent) {
          if (Array.isArray(notMatches) && notMatches.length) {
            logRecognizeNoIntent({
              companyId,
              callFlowId,
              callId,
              text: formData[answerVariable],
              responseList: notMatches,
            });
          }
          throw new Error("couldn't find intent!");
        }

        if (formData[answerVariable]) formData[answerVariable] = intent;
      } catch (ex) {
        console.log(
          `[${conversationId} - ${flowId} - ${flowName}] [FORMS] Validate grammar exception - question: ${JSON.stringify(
            question
          )} - ex: ${ex.message}`
        );
        errors.push({ answerVariable, validationErrorMessage });
      }
    }

    if (errors.length) {
      await traceLog({
        sender,
        recipient,
        companyId,
        callId,
        callFlowId,
        data: conversationData.data,
        allowLogInfo: true,
        content: `User submit: ${JSON.stringify(formData, null, 2)} | Errors: ${JSON.stringify(errors, null, 2)}`,
        logType: 'error',
        actionName: 'User Form Submission Failed',
        currentFlowId: flowId,
      });
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [FORMS] User input invalid fields: ${errors
          .map((e) => e.answerVariable)
          .join(', ')} => user have to submit again!`
      );
      return await step.replaceDialog(FORM_WATERFALL, {
        ...step._info.options,
        errors,
      });
    }

    await step.context.sendActivity({
      type: CustomActivityTypes.ValidateResult,
      channelData: { valid: true },
    });

    return await step.next();
  }

  async handleData(step) {
    const { Cases, OtherCases } = step._info.options;

    const { data: formData } = step.context.activity;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    const { flowData, companyId, callFlowId, callId, recipient, sender, data, conversationId } = conversationData;
    const { flowId, flowName } = flowData.flowInfo[0];

    if (!formData) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [FORMS] Can not get user form => go to other case`);
      return await step.endDialog(OtherCases);
    }

    conversationData.data = { ...data, ...formData };

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [FORMS] Receive data from user: ${JSON.stringify(formData)}`);
    await traceLog({
      sender,
      recipient,
      companyId,
      callId,
      callFlowId,
      data,
      allowLogInfo: true,
      content: `User submit: ${JSON.stringify(formData, null, 2)}`,
      logType: 'info',
      actionName: 'User Form Submission',
      currentFlowId: flowId,
    });

    return await step.endDialog(Cases);
  }

  async getTranslated(string, desLang = 'en', defaultLanguage = 'en', service, serviceRequestTimeout) {
    try {
      const data = JSON.parse(string);

      if (!Array.isArray(data)) return string;

      let { text } = data.find((e) => e.language.includes(desLang) || e.language == desLang) || {};

      if (!text) {
        let { text: defaultLanguageText } = data.find((e) => e.language.includes(defaultLanguage.split('-')[0])) || {};

        return await translate(defaultLanguageText, defaultLanguage, desLang, service, serviceRequestTimeout);
      }

      return text;
    } catch (e) {
      console.log('Parse to get translated text failed: ' + e.message);
      console.log('Data: ' + string);
      return string;
    }
  }
}

module.exports = {
  FormDialog,
};
