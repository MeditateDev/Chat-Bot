const { ComponentDialog, WaterfallDialog } = require('botbuilder-dialogs');
const { traceLog } = require('../services/callflowLog');

const { OUTREACH_DIALOG, ERROR_CODES } = require('../constant');
const { paramsExtract, replaceStrWithParam, replaceObjWithParam, isFalse } = require('../util/helper');
const { performOutreach } = require('../services/service');

const OUTREACH_WATERFALL = 'OUTREACH_WATERFALL';

class OutReachDialog extends ComponentDialog {
  constructor(dialog) {
    super(OUTREACH_DIALOG);
    this.dialog = dialog;

    this.addDialog(new WaterfallDialog(OUTREACH_WATERFALL, [this.sendOutReach.bind(this)]));

    this.initialDialogId = OUTREACH_WATERFALL;
  }

  // ask
  async sendOutReach(step) {
    const {
      Key,
      Name,
      Cases,
      OtherCases,
      Attribute,
      CallerId,
      CallerNumber,
      CallflowId,
      Language,
      OutreachType,
      PhoneNumber,
    } = step._info.options;

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

    const { flowId, flowName } = flowData.flowInfo[0];

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [Outreach] ${Name} - Key : ${Key}`);

    if (isFalse(CallflowId)) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [Outreach] Flow id is empty => go to other case`);

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.OUTREACH.OUTREACH_CONFIG_EMPTY,
        ERROR_MESSAGE: 'Flow id is empty empty',
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog(OtherCases);
    }

    if (isFalse(PhoneNumber)) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [Outreach] Phone number is empty => go to other case`);

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.OUTREACH.OUTREACH_PHONE_EMPTY,
        ERROR_MESSAGE: 'Phone number is empty',
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog(OtherCases);
    }

    if (OutreachType === 'sms' && isFalse(CallerNumber)) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [Outreach] Caller is empty => go to other case`);

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.OUTREACH.OUTREACH_TRUNK_EMPTY,
        ERROR_MESSAGE: 'Caller is empty',
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog(OtherCases);
    }

    if (OutreachType != 'sms' && isFalse(CallerId)) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [Outreach] CallerId is empty => go to other case`);

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: ERROR_CODES.OUTREACH.OUTREACH_TRUNK_EMPTY,
        ERROR_MESSAGE: 'CallerId is empty',
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog(OtherCases);
    }

    const { result, error } = await performOutreach({
      CallflowId,
      PhoneNumber: replaceStrWithParam(conversationData.data, PhoneNumber),
      CallerId: replaceStrWithParam(conversationData.data, PhoneNumber),
      Language,
      CallerNumber: replaceStrWithParam(conversationData.data, CallerNumber),
      Attribute: JSON.stringify(replaceObjWithParam(conversationData.data, paramsExtract(Attribute))),
      OutreachType,
      serviceRequestTimeout,
    });

    if (!result) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [Outreach] Call API Outreach failed => go to other case`);
      if (error) {
        conversationData.runErrorFlow = true;

        conversationData.data = {
          ...conversationData.data,
          ERROR_CODE: ERROR_CODES.OUTREACH.OUTREACH_FAILED,
          ERROR_MESSAGE: `Call API outreach failed: ${error.message}. StatusCode: ${
            error.response && error.response.statusCode
          }`,
          CURRENT_ACTION_NAME: Name,
        };
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
          content:
            (error.response &&
              `Action: ${Name} | Error: Call API in Outreach action failed | Response: ${JSON.stringify(
                error.response.data
              )}`) ||
            `Action: ${Name} | Error: Call API in Outreach action failed | Message: ${error.message}`,
          logType: 'error',
          actionName: Name,
          actionKey: Key,
          currentFlowId: flowId,
          timeout: serviceRequestTimeout,
        });
        console.log(
          `[${conversationId} - ${flowId} - ${flowName}] [Outreach] Call API in Outreach action failed ${error.message} => go to other case`
        );
      }
      return await step.endDialog(OtherCases);
    }
    console.log(
      `[${conversationId} - ${flowId} - ${flowName}] [Outreach] Call API in Outreach action success => go to success case`
    );
    return await step.endDialog(Cases);
  }
}

module.exports = {
  OutReachDialog,
};
