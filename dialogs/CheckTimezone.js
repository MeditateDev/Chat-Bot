const { ComponentDialog, WaterfallDialog } = require("botbuilder-dialogs");
const moment = require("moment-timezone");

const { replaceStrWithParam } = require("../util/helper");
const { CHECK_TIMEZONE_DIALOG } = require("../constant");
const { traceLog } = require("../services/callflowLog");

const CHECK_TIMEZONE_WATERFALL = "CHECK_TIMEZONE_WATERFALL";

class CheckTimezoneDialog extends ComponentDialog {
  constructor(dialog) {
    super(CHECK_TIMEZONE_DIALOG);
    this.dialog = dialog;

    this.addDialog(
      new WaterfallDialog(CHECK_TIMEZONE_WATERFALL, [this.checkTime.bind(this)])
    );

    this.initialDialogId = CHECK_TIMEZONE_WATERFALL;
  }

  // ask
  async checkTime(step) {
    const {
      OtherCases,
      Cases,
      Time,
      Timezone,
      TimezoneCustom,
      TimezoneOption,
      Name,
      Key,
    } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(
      step.context
    );

    const {
      companyId,
      callFlowId,
      sender,
      data,
      allowLogInfo,
      callId,
      recipient,
      flowData,
    } = conversationData;

    const { flowId, flowName } = flowData.flowInfo[0];

    console.log(
      `[${flowId} - ${flowName}] [CHECK TIMEZONE] ${Name} - Key: ${Key}`
    );

    const options = {
      1: Timezone,
      2: replaceStrWithParam(data, TimezoneCustom),
    };

    const result = this.validate({
      option: options[TimezoneOption],
      time: Time,
    });

    if (!result) {
      console.log("Check time zone failed => go to other case!");
      await traceLog({
        sender,
        recipient,
        companyId,
        callId,
        callFlowId,
        data,
        allowLogInfo,
        content: `Check time result: Failed`,
        logType: "info",
        actionName: Name,
        actionKey: Key,
        currentFlowId: flowId,
      });

      return await step.endDialog(OtherCases);
    }

    console.log("Check time zone success => go to success case!");

    await traceLog({
      sender,
      recipient,
      companyId,
      callId,
      callFlowId,
      data,
      allowLogInfo,
      content: `Check time result: Passed`,
      logType: "info",
      actionName: Name,
      actionKey: Key,
      currentFlowId: flowId,
    });

    return await step.endDialog(Cases);
  }

  parseTimes(times) {
    const parsedTimes = {};

    times.forEach((timeString) => {
      const [day, range] = timeString.split("=");
      const [start, end] = range.split("-");

      if (!parsedTimes[day]) {
        parsedTimes[day] = [];
      }

      parsedTimes[day].push({ start, end });
    });

    return parsedTimes;
  }

  validate({ option, time }) {
    if (!option || !time) return false;

    try {
      const times = this.parseTimes(time.split("|"));

      if (!moment.tz.names().includes(option)) {
        console.log(`Invalid timezone: ${option}`);
        return false;
      }

      const currentDay = moment().tz(option).format("dddd");
      const currentTime = moment().tz(option).format("HH:mm");

      console.log(
        `Validate time zone: Current day ${currentDay} - Current time ${currentTime}`
      );
      if (!times[currentDay]) return false;

      for (const range of times[currentDay]) {
        const { start, end } = range;
        if (
          currentTime >= moment(start, "HH:mm").format("HH:mm") &&
          currentTime <= moment(end, "HH:mm").format("HH:mm")
        ) {
          console.log(
            `Validate time zone: Passed case start ${start} - end ${end}`
          );
          return true;
        }
      }
    } catch (e) {
      console.log(
        `Validate time zone error : ${
          e.message
        } - ${option} - Data : ${JSON.stringify(time)}`
      );
    }
    return false;
  }
}

module.exports = {
  CheckTimezoneDialog,
};
