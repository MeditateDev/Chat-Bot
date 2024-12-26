const { ActivityHandler, ActivityTypes } = require('botbuilder');

const { trimStr } = require('../util/helper');
const { errorLog } = require('../services/callflowLog');
const { saveConversationState } = require('../services/service');
const { mailReport } = require('../services');
const moment = require('moment-timezone');

class CalBot extends ActivityHandler {
  constructor(conversationState, dialog, hookBot) {
    super();
    if (!conversationState) throw new Error('[DialogBot]: Missing parameter. conversationState is required');
    if (!dialog) throw new Error('[DialogBot]: Missing parameter. dialog is required');

    this.dialog = dialog;
    this.conversationState = conversationState;
    this.dialogState = this.conversationState.createProperty('DialogState');

    this.onEvent(async (context, next) => {
      try {
        if (context.activity.name != 'typing') {
          console.log(`Receive event from ${context.activity.from.id} - ${context.activity.name}`);
        }
        await this.dialog.handleEvent(context);
      } catch (e) {
        console.error(`Handle event ${context.activity.name} error : ${e.message}`);
        errorLog(e);
        await mailReport.mailError({
          type: 'RUNTIME',
          message: e.message,
          stack: (e.error && e.error.stack) || e.stack || 'No error stack',
        });
        await this.runErrorFlow(context, e);
      }
      await next();
    });

    this.onTurn(async (context, next) => {
      try {
        if (context.activity.type == ActivityTypes.Message) {
          await this.dialog.updateConversationStateData(context);
        }

        context.onSendActivities(async (ctx, activities, next) => {
          for (let [i, activity] of activities.entries()) {
            if (activity.type !== ActivityTypes.Message) continue;
            activity.text = trimStr(activity.text);
            const conversationData = await this.storeContent(context, activity, true);

            if (conversationData && conversationData.data) {
              conversationData.data.BOT_RESPONSE = activity.text;
            }

            await hookBot.adapter.executeFlow(
              context.activity,
              async (hookContext) => await hookBot.run(hookContext, conversationData, false)
            );

            if (conversationData && conversationData.errorHappensInHook) {
              activities = activities.splice(i, 1);
              return await this.dialog.runErrorFlow(context);
            }

            console.log(`[${activity.conversation.id}] Bot sent content: ${activity.text}`);
          }

          if (!ctx.responded && ctx.activity.type === ActivityTypes.Message) {
            console.log(`[${context.activity.conversation.id}] User content: ${context.activity.text}`);
            await this.storeContent(context, context.activity, false);
            await this.dialog.addUserMsgToDB(context);
          }
          await this.dialog.updateUserData(ctx);
          await next();
        });

        // hook before bot sent message
        context.onSentMessage = async (ctx, result, next) => {
          if (!ctx.notSaveMsgToDB) await this.dialog.addBotMsgToDB(result.activities, ctx, result.responses);
          const conversationData = await this.getConversationData(ctx);
          for (let item of result?.responses) {
            if (conversationData && conversationData.data) {
              conversationData.data.MSG_ID = item.messageId;
            }
          }

          return next();
        };

        await next();
      } catch (e) {
        if ((e.ERROR_CODE && e.ERROR_MESSAGE) || (e.error && e.error.ERROR_CODE && e.error.ERROR_MESSAGE)) {
          return await this.runErrorFlow(context, e);
        }

        console.log('Error occurred while running flow: ' + e.message);
        console.error('Error occurred while running flow: ' + e.message);
        console.error((e.error && e.error.stack) || e.stack);
        errorLog(e);
        await mailReport.mailError({
          type: 'RUNTIME',
          message: e.message,
          stack: (e.error && e.error.stack) || e.stack || 'No error stack',
        });
        await this.runErrorFlow(context, e);
      }
    });

    this.onMessage(async (context, next) => {
      const conversationData = await this.dialog.conversationDataAccessor.get(context);

      if (conversationData && conversationData.inComingHookFlow) {
        await hookBot.adapter.executeFlow(
          context.activity,
          async (hookContext) => await hookBot.run(hookContext, conversationData, true)
        );

        if (conversationData.errorHappensInHook) {
          return await this.dialog.runErrorFlow(context);
        }
      }
      // Run the Dialog with the new message Activity.
      await this.dialog.run(context, this.dialogState);
      await next();
    });
  }

  async getConversationData(context) {
    return await this.dialog.conversationDataAccessor.get(context);
  }

  async storeContent(context, activity, isBot) {
    const conversationData = await this.dialog.conversationDataAccessor.get(context);
    if (!conversationData || !conversationData.data) {
      console.log('Found no conversation data to store message!');
      return;
    }
    if (!conversationData.data.CONVERSATION) conversationData.data.CONVERSATION = [];

    const { text, data } = activity;

    let content = text;

    if (text === 'USER_SUBMIT_FORM_TO_BOT') {
      content = data;
    }

    conversationData.data.CONVERSATION = [
      ...conversationData.data.CONVERSATION,
      {
        ...(isBot ? { sender: 'Bot', receiver: 'User' } : { sender: 'User', receiver: 'Bot' }),
        content: content,
        datetime: moment().format('DD-MMM-YY dddd HH:mm:ss A'),
      },
    ];

    return conversationData;
  }

  async runErrorFlow(context, err) {
    const conversationData = await this.dialog.conversationDataAccessor.get(context);

    if (!conversationData) {
      console.error('Run error flow and got an error ' + err.message);
      console.error((err.error && err.error.stack) || err.stack);
      await context.sendActivity(process.env.ERROR_MESSAGE || 'Sorry, there was an error. Please try again later.');
    }

    try {
      conversationData.data.ERROR = err;
      conversationData.data.ERROR_CODE = err.ERROR_CODE || (err.error && err.error.ERROR_CODE) || '';
      conversationData.data.ERROR_MESSAGE = err.ERROR_MESSAGE || (err.error && err.error.ERROR_MESSAGE) || err.message;
      if (conversationData.inErrorFlow) {
        throw err;
      }
      conversationData.runErrorFlow = true;
      delete context.activity.extenData;
      delete context.activity.attribute;
      await this.dialog.runErrorFlow(context);
    } catch (e) {
      console.log('Run error flow and got an error ' + e.message);
      console.error('Run error flow and got an error ' + e.message);
      console.error((e.error && e.error.stack) || e.stack);
      await mailReport.mailError({
        type: 'RUNTIME',
        message: e.message,
        stack: (e.error && e.error.stack) || e.stack || 'No error stack',
      });
      await context.sendActivity(
        conversationData.errorMessage || process.env.ERROR_MESSAGE || 'Sorry, there was an error. Please try again later.'
      );
    }
  }

  async run(context) {
    await super.run(context);

    if (context.activity.name == 'typing' || context.activity.name == 'seen') return;

    // Save any state changes. The load happened during the execution of the Dialog.
    await this.conversationState.saveChanges(context, false);

    const cached = context.turnState.get(this.conversationState.stateKey);
    const { state } = cached || {};

    const isEnd = context.activity.name === 'endConversation';

    if (!isEnd) {
      await this.dialog.sendTypingIndicator(context, false);
    }

    await saveConversationState({
      ContactMessageUID: context.activity.conversation.id,
      ConversationData: (!isEnd && state && state.conversationData) || {},
      DialogStack: (!isEnd && state && state.DialogState && state.DialogState.dialogStack) || [],
      AddressObj: context.activity,
    });
  }
}

module.exports = {
  CalBot,
};
