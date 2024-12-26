const {
  ConversationState,
  MemoryStorage,
  ActivityTypes,
} = require("botbuilder");
const { CustomAdapter } = require("../classes/CustomAdapter");
const { HookBot } = require("./hook");
const { CalBot } = require("./cal");
const { TurnContext } = require("botbuilder-core");
const { MainDialog } = require("../dialogs/MainDialog");
const { HookBotDialog } = require("../dialogs/HookBotMainDialog");

const adapter = new CustomAdapter();

const memoryStorage = new MemoryStorage();
const conversationState = new ConversationState(memoryStorage);

const hookBotMemoryStorage = new MemoryStorage();
const hookBotConversationState = new ConversationState(hookBotMemoryStorage);

const hookBotDialog = new HookBotDialog(
  hookBotConversationState,
  new CustomAdapter()
);
const hookBot = new HookBot(
  hookBotConversationState,
  hookBotDialog,
  hookBotDialog.adapter
);

const mainDialog = new MainDialog(conversationState, adapter, hookBot);
const calBot = new CalBot(conversationState, mainDialog, hookBot);

TurnContext.prototype.sendActivities = async function sendActivities(
  activities
) {
  let sentNonTraceActivity = false;
  const ref = TurnContext.getConversationReference(this.activity);
  ref.isOutreach = this.activity.name === "proactiveMessageTrigger";
  const output = activities.map((activity) => {
    const result = TurnContext.applyConversationReference(
      { ...activity },
      ref,
      ref.isOutreach
    );

    if (!result.type) {
      result.type = ActivityTypes.Message;
    }

    if (result.type !== ActivityTypes.Trace) {
      sentNonTraceActivity = true;
    }

    if (result.id) {
      delete result.id;
    }

    return result;
  });

  let rs;

  await this.emit(this._onSendActivities, output, async () => {
    if (this.activity.deliveryMode === "expectReplies") {
      // Append activities to buffer
      const responses = [];
      output.forEach((a) => {
        this.bufferedReplyActivities.push(a);

        // Ensure the TurnState has the InvokeResponseKey, since this activity
        // is not being sent through the adapter, where it would be added to TurnState.
        if (a.type === ActivityTypes.InvokeResponse) {
          this.turnState.set(INVOKE_RESPONSE_KEY, a);
        }

        responses.push({ id: undefined });
      });

      // Set responded flag
      if (sentNonTraceActivity) {
        this.responded = true;
      }

      return responses;
    } else {
      const responses = await adapter.sendActivities(this, output);

      // Set responded flag
      if (sentNonTraceActivity) {
        this.responded = true;
      }

      rs = responses;

      await this.emit(
        [this.onSentMessage],
        {
          activities: output,
          responses,
        },
        async () => {}
      );

      return responses;
    }
  });

  return rs;
};

TurnContext.prototype.sendActivity = async function sendActivity(
  activityOrText,
  speak,
  inputHint
) {
  let a;
  if (typeof activityOrText === "string") {
    a = { text: activityOrText, inputHint: inputHint || "acceptingInput" };
    if (speak) {
      a.speak = speak;
    }
  } else {
    a = activityOrText;
  }

  try {
    const [response] = (await this.sendActivities([a])) || [];

    if (!a || !a.text || !a.text.trim()) {
      return {
        success: true,
        message: `Success = true because this is not a message`,
      };
    }

    return {
      success: !!(response && response.success),
      message: ``,
      messageId: response.messageId,
    };
  } catch (e) {
    console.error(`Send activity failed - ${e.stack || e.message}`);

    return {
      success: false,
      message: `Send activity failed - ${e.stack || e.message}`,
    };
  }
};

module.exports = {
  calBot,
  hookBot,
  adapter,
  handleAgentReply: (req, res) => mainDialog.handleReply(req, res),
};
