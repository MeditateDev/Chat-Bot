const { ActivityTypes } = require('botbuilder');

const CustomActivityTypes = {
  ...ActivityTypes,
  StopTyping: 'stop-typing',
  Form: 'form',
  ValidateResult: 'validate-result',
  AgentConnect: 'agent-connect',
  AgentDisconnect: 'agent-disconnect',
  ShowChatIcon: 'show-chat-icon',
  ReplaceBotName: 'replace-bot-name',
  Cards: 'cards',
  Image: 'image',
  Video: 'video',
  Buttons: 'buttons',
};

module.exports = { CustomActivityTypes };
