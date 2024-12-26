const { ActivityHandler } = require('botbuilder');

class HookBot extends ActivityHandler {
  constructor(conversationState, dialog, adapter) {
    super();
    if (!conversationState) throw new Error('[DialogBot]: Missing parameter. conversationState is required');
    if (!dialog) throw new Error('[DialogBot]: Missing parameter. dialog is required');

    this.dialog = dialog;
    this.adapter = adapter;
    this.conversationState = conversationState;
    this.dialogState = this.conversationState.createProperty('DialogState');

    this.onMessage(async (context, next) => {
      await this.dialog.run(context, this.dialogState);
      await next();
    });
  }

  async run(context, data, isUser) {
    // await super.run(context, accessor);
    if (!data) return;

    await this.dialog.run(context, data, isUser);

    if (context.activity.name == 'typing' || context.activity.name == 'seen') return;

    // Save any state changes. The load happened during the execution of the Dialog.
    await this.conversationState.saveChanges(context, false);
  }
}
module.exports = { HookBot };
