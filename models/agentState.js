class AgentState {
  constructor({
    agentId,
    agentActivity,
    agentClientId,
    agentChannelId,
    agentBotId,
    userId,
    userChannelId,
    userBotId,
  }) {
    this.agentId = agentId;

    this.agentActivity = agentActivity;

    this.agentClientId = agentClientId;
    this.agentChannelId = agentChannelId;
    this.agentBotId = agentBotId;

    this.userId = userId;
    this.userChannelId = userChannelId;
    this.userBotId = userBotId;
  }
}
module.exports = AgentState;
