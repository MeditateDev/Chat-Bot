const { ComponentDialog, WaterfallDialog } = require('botbuilder-dialogs');
const { traceLog } = require('../services/callflowLog');

const { MULTIPLE_CONDITION_DIALOG } = require('../constant');
const { tryParseJSON, replaceObjWithParam, checkCondition, getValueByPath } = require('../util/helper');

class MultipleConditionDialog extends ComponentDialog {
  constructor(dialog) {
    super(MULTIPLE_CONDITION_DIALOG);
    this.dialog = dialog;

    this.addDialog(new WaterfallDialog('MULTIPLE_CONDITION_WATERFALL', [this.checkMultiple.bind(this)]));

    this.initialDialogId = 'MULTIPLE_CONDITION_WATERFALL';
  }

  async checkMultiple(step) {
    const { Key, Name, Attribute, Cases, OtherCases, Type } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

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

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [Multiple Condition] ${Name} - Key: ${Key}`);

    let conditions = tryParseJSON(Attribute);

    if (!Array.isArray(conditions) || !conditions.length || !Type) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [Multiple Condition] Invalid config => go to other cases`);

      return await step.endDialog(OtherCases);
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
      content: `Start checking with condition type is ${Type}`,
      logType: 'info',
      actionName: Name,
      actionKey: Key,
      currentFlowId: flowId,
      timeout: serviceRequestTimeout,
    });

    conditions = conditions.map((c) => {
      const raw = c.value;
      const name = c.name;
      return {
        ...replaceObjWithParam(data, c),
        raw,
        name,
      };
    });

    for (let con of conditions) {
      const { name, value, condition, raw } = con;

      if (!name || !condition) continue;

      const checkVal = name.includes('->') ? getValueByPath(data, name) : data[name];

      const rs = checkCondition({ checkVal, value, condition, name, data });

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
        content: `Check {${name}}: return ${rs}`,
        logType: 'info',
        actionName: Name,
        actionKey: Key,
        currentFlowId: flowId,
        jsonRefData: {
          variableName: name,
          variableValue: checkVal,
          condition: condition,
          rawValue: raw,
          compareValue: value,
          result: rs,
        },
        timeout: serviceRequestTimeout,
      });

      if (Type === 'AND' && !rs) {
        console.log(
          `[${conversationId} - ${flowId} - ${flowName}] [Multiple Condition] 1 condition return false with type AND => go to other cases`
        );

        return await step.endDialog(OtherCases);
      }

      if (Type === 'OR' && rs) {
        console.log(
          `[${conversationId} - ${flowId} - ${flowName}] [Multiple Condition] 1 condition return true with type OR => go to success case`
        );

        return await step.endDialog(Cases);
      }
    }

    if (Type === 'OR') {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [Multiple Condition] no passed case with type OR => go to other cases`
      );

      return await step.endDialog(OtherCases);
    }

    console.log(
      `[${conversationId} - ${flowId} - ${flowName}] [Multiple Condition] All cases passed with type AND => go to success case`
    );

    return await step.endDialog(Cases);
  }
}

module.exports = {
  MultipleConditionDialog,
};
