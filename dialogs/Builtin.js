const { ComponentDialog, WaterfallDialog } = require('botbuilder-dialogs');
const { traceLog } = require('../services/callflowLog');

const { BUILTIN_DIALOG } = require('../constant');
const { tryParseJSON, replaceObjWithParam } = require('../util/helper');
const { checkBuiltIn } = require('../services/grammars');
const { ERROR_CODES } = require('../constant');

const listFunction = {
  toLowerCase: 'To Lowercase',
  toUpperCase: 'To Uppercase',
  trim: 'Trim',
  length: 'Length',
  pop: 'Pop',
  shift: 'Shift',
  reverse: 'Reverse',
  sort: 'Sort',
  rsort: 'Reverse Sort',
  toString: 'To String',
  parseInt: 'To Int',
  parseFloat: 'To Float',
  parseBoolean: 'To Boolean',
  'Yes or No': 'Yes or No',
  'Date (mm-dd-yyyy)': 'Date (mm-dd-yyyy)',
  'Phone number': 'Phone number',
  Number: 'Number',
  Email: 'Email',
};

class BuiltInDialog extends ComponentDialog {
  constructor(dialog) {
    super(BUILTIN_DIALOG);
    this.dialog = dialog;

    this.addDialog(new WaterfallDialog('BUILT_IN_WATERFALL', [this.handleBuiltIn.bind(this)]));

    this.initialDialogId = 'BUILT_IN_WATERFALL';
  }

  async handleBuiltIn(step) {
    const { Key, Name, Attribute, Cases, OtherCases } = step._info.options;

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

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [BuiltIn Function] ${Name} - Key: ${Key}`);

    let handlers = tryParseJSON(Attribute);

    if (!Array.isArray(handlers) || !handlers.length) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [BuiltIn Function] Invalid config => go to other cases`);

      return await step.endDialog(OtherCases);
    }

    try {
      handlers = handlers.map((h) => {
        const raw = h.value;
        return {
          ...replaceObjWithParam(data, h),
          raw,
        };
      });

      for (let func of handlers) {
        let { raw, name, value, function: fName } = func;

        let rs;

        if (['pop', 'shift', 'reverse', 'sort', 'rsort'].includes(fName) && !Array.isArray(value)) {
          throw new Error(`${listFunction[fName]} "${raw}": value is not an array`);
        }

        switch (fName) {
          case 'Yes or No':
          case 'Date (mm-dd-yyyy)':
          case 'Phone number':
          case 'Number':
          case 'Email':
            rs = await checkBuiltIn({ ur: value, type: fName, timeout: serviceRequestTimeout });
            break;
          case 'toLowerCase':
            rs = value.toLowerCase();
            break;
          case 'toUpperCase':
            rs = value.toUpperCase();
            break;
          case 'trim':
            rs = value.trim();
            break;
          case 'length':
            rs = value.length;
            break;
          case 'pop':
            rs = [...value];
            rs.pop();
            break;
          case 'shift':
            rs = [...value];
            rs.shift();
            break;
          case 'rsort':
            if (value.every((e) => typeof e === 'number')) {
              rs = [...value].sort((a, b) => a - b);
            } else {
              rs = [...value].sort();
            }
            rs = rs.reverse();
            break;
          case 'sort':
            if (value.every((e) => typeof e === 'number')) {
              rs = [...value].sort((a, b) => a - b);
            } else {
              rs = [...value].sort();
            }
            break;
          case 'reverse':
            rs = [...value].reverse();
            break;
          case 'toString':
            if (typeof value === 'object' && !Array.isArray(value)) {
              rs = JSON.stringify(value);
            } else {
              rs = value.toString();
            }
            break;
          case 'parseInt':
            rs = parseInt(value);
            break;
          case 'parseFloat':
            rs = parseFloat(value);
            break;
          case 'parseBoolean':
            rs = value === 'true' || value === true;
            break;
          default:
            throw new Error(`Invalid function: ${fName}`);
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
          content: `${listFunction[fName]} "${raw}": return ${rs}`,
          logType: 'info',
          actionName: Name,
          actionKey: Key,
          currentFlowId: flowId,
          jsonRefData: {
            inputValue: value,
            function: listFunction[fName],
            outputValue: rs,
          },
          timeout: serviceRequestTimeout,
        });

        conversationData.data[name] = rs;
      }
    } catch (e) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [BuiltIn Function] Handle action error ${e.message} => go to other case`
      );

      conversationData.runErrorFlow = true;

      conversationData.data = {
        ...conversationData.data,
        ERROR_CODE: e.ERROR_CODE || ERROR_CODES.BUILTIN_FAILED,
        ERROR_MESSAGE: e.ERROR_MESSAGE || e.message,
        CURRENT_ACTION_NAME: Name,
      };

      return await step.endDialog(OtherCases);
    }

    console.log(`[${conversationId} - ${flowId} - ${flowName}] [BuiltIn Function] Go to success case`);

    return await step.endDialog(Cases);
  }
}

module.exports = {
  BuiltInDialog,
};
