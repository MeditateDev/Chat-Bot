const { ComponentDialog, WaterfallDialog } = require('botbuilder-dialogs');

const { replaceStrWithParam, replaceObjWithParam } = require('../util/helper');
const { SEND_MAIL_DIALOG, ERROR_CODES } = require('../constant');
const { sendMail } = require('../services/service');

const SEND_MAIL_WATERFALL = 'SEND_MAIL_WATERFALL';

class SendMailDialog extends ComponentDialog {
  constructor(dialog) {
    super(SEND_MAIL_DIALOG);
    this.dialog = dialog;

    this.addDialog(new WaterfallDialog(SEND_MAIL_WATERFALL, [this.sendMail.bind(this)]));

    this.initialDialogId = SEND_MAIL_WATERFALL;
  }

  // ask
  async sendMail(step) {
    const {
      EmailName,
      EmailAddress,
      EmailRecipients,
      EmailSubject,
      Template,
      TemplateCustom,
      TemplateVariable,
      OtherCases,
      Cases,
      OptionTemplate,
      Name,
      Key,
    } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    const { data, flowData, conversationId, serviceRequestTimeout } = conversationData;

    const { flowId, flowName } = flowData.flowInfo[0];

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [SendMail] ${Name} - Key: ${Key}`);

    let variables = [];

    try {
      variables = JSON.parse(TemplateVariable);

      if (!Array.isArray(variables)) throw new Error('Invalid template variables');
    } catch (e) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [SendMail] Can not parse template variables: ${e.message} => go to other case`
      );
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [SendMail] Data: ` + TemplateVariable);

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.SEND_MAIL.SEND_MAIL_INVALID_DATA,
        ERROR_MESSAGE: `Invalid email variable data: ${TemplateVariable}`,
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog(OtherCases);
    }

    variables = variables.map((val) => {
      let { name, value } = replaceObjWithParam(data, val);

      if (typeof value !== 'string') value = JSON.stringify(value);

      return { name, value };
    });

    const options = {
      emailName: replaceStrWithParam(data, EmailName),
      templateVariable: JSON.stringify(variables),
      emailRecipients: replaceStrWithParam(data, EmailRecipients), //required
      templateCustom: replaceStrWithParam(data, TemplateCustom),
      emailAddress: replaceStrWithParam(data, EmailAddress),
      emailSubject: replaceStrWithParam(data, EmailSubject),
      template: Template,
      optionTemplate: OptionTemplate,
    };

    if (!options.emailName || !options.emailAddress || !options.emailSubject || !options.emailRecipients) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [SendMail] Missing required params => go to other case`);

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.SEND_MAIL.SEND_MAIL_CONFIG_EMPTY,
        ERROR_MESSAGE: `Required field is empty (Email name, Email Address, Email Subject, Email recipients)`,
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog(OtherCases);
    }

    const { result, error } = await sendMail(options, serviceRequestTimeout);

    if (!result) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [SendMail] Call API send mail failed => go to other case`);

      if (error) {
        conversationData.runErrorFlow = true;

        conversationData.data = {
          ...conversationData.data,
          ERROR_CODE: ERROR_CODES.SEND_MAIL.SEND_MAIL_FAILED,
          ERROR_MESSAGE: `Call API send mail failed : ${error.message}. StatusCode: ${
            error.response && error.response.status
          }`,
          CURRENT_ACTION_NAME: Name,
        };
      }

      return await step.endDialog(OtherCases);
    }

    return await step.endDialog(Cases);
  }
}

module.exports = {
  SendMailDialog,
};
