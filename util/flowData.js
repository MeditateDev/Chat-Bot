module.exports = class FlowData {
  constructor(data) {
    const { currentFlow, continueActions, previousFlows, flowsConversationData, outputSubFlowData, routingFlows, flowInfo } =
      data;

    this.currentFlow = currentFlow;
    this.continueActions = continueActions || [];
    this.previousFlows = previousFlows || [];
    this.flowsConversationData = flowsConversationData || [];
    this.outputSubFlowData = outputSubFlowData || [];
    this.routingFlows = routingFlows || [];
    this.flowInfo = flowInfo || [];
  }

  handleRoutingIntent(i) {
    if (i === -1 || i === 0) return this;

    this.flowInfo = this.flowInfo.slice(i);
    this.routingFlows = this.routingFlows.slice(i);

    // use main flow if there is no current flow ( minus 1 )
    this.currentFlow = this.previousFlows[i - 1] || this.previousFlows[this.previousFlows.length - 1] || this.currentFlow;

    this.continueActions = this.continueActions.slice(i);
    // this.flowsConversationData = this.flowsConversationData.slice(i);
    // this.outputSubFlowData = this.outputSubFlowData.slice(i);
    this.previousFlows = this.previousFlows.slice(i);

    return this;
  }
};
