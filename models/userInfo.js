const utils = require('../util/helper');

class UserInfo {
  constructor(activity) {
    this.activity = activity;
    this.id = activity.conversation.id;
    this.name =
      (activity.from.name &&
        !['you', 'facebook user', 'user', 'guest'].find((c) => activity.from.name.toString().toLowerCase().startsWith(c)) &&
        activity.from.name) ||
      '';
    this.phone = utils.getPhoneNumber(activity.from.id) || '';
    this.acceptFQ = false;
    this.isRepeat = false;
    this.vdn = '';
    this.talkToLastAgent = '';
    this.lastVDN = '';
    this.contactMessage = null;
    this.prescreen = null;
    this.fqInfo = null;
    this.mainMenu = null;
    this.prescreenMenu = null;
    this.finalStep = false;
    this.message = null;
    this.reason = '';
    this.showConnectAgentTime = 0;
    this.FQLinkScopeID = 0;
    this.notifyConnect = false;
    this.agentName = '';
    this.agentID = '';
    this.isReplied = false;
    this.email = null;
    this.connected = false;
    this.lastMsg = '';
    this.completed = false;
  }
}
module.exports = UserInfo;
