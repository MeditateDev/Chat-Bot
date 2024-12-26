const { ComponentDialog, WaterfallDialog, Dialog, TextPrompt } = require('botbuilder-dialogs');
const { traceLog } = require('../services/callflowLog');
const Cards = require('../util/cards');

const { CARDS_DIALOG } = require('../constant');
const { getUserID } = require('../util/helper');

const CARDS_WATERFALL = 'CARDS_WATERFALL';
const CARDS_PROMPT = 'CARDS_PROMPT';

class CardsDialog extends ComponentDialog {
  constructor(dialog) {
    super(CARDS_DIALOG);
    this.dialog = dialog;

    this.addDialog(new TextPrompt(CARDS_PROMPT));

    this.addDialog(new WaterfallDialog(CARDS_WATERFALL, [this.sendCards.bind(this), this.handleResponse.bind(this)]));

    this.initialDialogId = CARDS_WATERFALL;
  }

  async sendCards(step) {
    const { Key, Name, Cards: newCards, OtherCases, Output, Option, DynamicCards, ImageRatio, Cases } = step._info.options;

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
      channelId,
      conversationId,
    } = conversationData;

    const { flowId, flowName } = flowData.flowInfo[0];

    const cardData = Option == 'dynamic' ? data[DynamicCards] : newCards;
    let cards = new Cards(cardData, channelId, flowId, Key, Output, data, ImageRatio);

    if (!cards.data) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [Cards] Can not get cards data => go to other case`);
      return await step.endDialog(OtherCases);
    }

    const content = cards.formatCard();

    const { channelData } = content;
    if (channelData && (!Array.isArray(channelData.cards) || !channelData.cards.length)) {
      console.log(
        `[${conversationId} - ${flowId} - ${flowName}] [Cards] Can not send card to user => go to error handler flow`
      );

      throw new Error('Can not format card data');
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
      content: `Action : ${Name} | Cards: `,
      logType: 'info',
      jsonRefData: channelData,
      actionName: Name,
      actionKey: Key,
      currentFlowId: flowId,
    });

    await step.context.sendActivity(content);

    if (!Output) {
      console.log(`[${conversationId} - ${flowId} - ${flowName}] [Cards] Can not get Output data => check for next case`);

      const Case = (Cases && Cases.length && Cases.find((c) => c.CaseOption === 'Success')) || OtherCases;

      return await step.endDialog(Case);
    }

    return await step.prompt(CARDS_PROMPT, {});
  }

  async handleResponse(step) {
    const { Key, Name, Cards: newCards, OtherCases, Output } = step._info.options;

    const conversationData = await this.dialog.conversationDataAccessor.get(step.context);

    conversationData.data[Output] = step.result;

    return await step.endDialog({ ...step._info.options, CheckForNextCase: true, AttributeToCheck: Output });
  }
}

module.exports = {
  CardsDialog,
};
