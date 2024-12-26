const AgentState = require('../models/agentState');
const userUtils = require('./user');
const helper = require('../util/helper');
const { TurnContext } = require('botbuilder');
const fs = require('fs');
const path = require('path');
var agentStateArr = [];
const AGENT_STATE_BACK_FILE = 'AgentStateData.txt';
const AGENT_CLIENT_FEATURE_PREFIX = '[AGENT_CLIENT_FEATURE]';
const AGENT_COMMAND = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  GUIDE: 'GUIDE',
  GOODBYE: 'GOODBYE',
};
const AGENT_COMMAND_ARR = [
  {
    command: '@login',
    key: AGENT_COMMAND.LOGIN,
  },
  {
    command: '@logout',
    key: AGENT_COMMAND.LOGOUT,
  },
  {
    command: '@guide',
    key: AGENT_COMMAND.GUIDE,
  },
  {
    command: 'goodbye',
    key: AGENT_COMMAND.GUIDE,
  },
];

const guideMsg = `Greetings and welcome to our service.
Below are some key commands at your disposal: 

To log in, use the command: @LOGIN {Agent_ID}
To log out, simply type: @LOGOUT
`;

const logFunc = (str) => {
  console.log(`${AGENT_CLIENT_FEATURE_PREFIX} - ${str}`);
};
logFunc(`Enable agent client feature: ${process.env.ENABLE_AGENT_CLIENT}`);

/** Backup agent state  */
const recoverAgentState = () => {
  try {
    if (!process.env.ENABLE_AGENT_CLIENT) return;

    if (!agentStateArr.length) {
      logFunc(`Start to recover agent state`);

      const agentStateFile = path.join(process.cwd(), AGENT_STATE_BACK_FILE);
      if (!fs.existsSync(agentStateFile)) {
        logFunc(`Not found agent state back file => not recover agent state - backUpDir: ${agentStateFile}`);
      }

      const data = JSON.parse(fs.readFileSync(agentStateFile).toString());

      agentStateArr = data;

      logFunc(`Recover agent state successfully - agentStateCount: ${agentStateArr.length}`);
    }
  } catch (e) {
    logFunc(`Recover agent state failed - err: ${e.message}`);
  }
};

recoverAgentState();

const saveAgentState = () => {
  try {
    if (!process.env.ENABLE_AGENT_CLIENT) return;

    const agentStateFile = path.join(process.cwd(), AGENT_STATE_BACK_FILE);
    fs.writeFileSync(agentStateFile, JSON.stringify(agentStateArr));
  } catch (e) {
    logFunc(`Save agent state failed - err: ${e.message}`);
  }
};

/** Agent state handler */
const addAgentState = (agentData) => {
  if (!process.env.ENABLE_AGENT_CLIENT) return;

  const { agentId, agentClientId, agentChannelId } = agentData;
  const exist = agentStateArr.find(
    (c) => c.agentId == agentId && c.agentClientId == agentClientId && c.agentChannelId == agentChannelId
  );

  if (exist) {
    return exist;
  }

  const newAgentState = new AgentState(agentData);
  agentStateArr.push(newAgentState);
};

/** Behavior handler */

const sendAgentMsgToUser = async (step, adapter) => {
  if (!process.env.ENABLE_AGENT_CLIENT) return await step.next();

  const activity = step.context.activity;

  const userMsg = activity.text && activity.text.toLowerCase();
  const agentChannelId = activity.channelId;
  const agentClientId = activity.from.id;
  const agentBotId = activity.recipient.id;

  if (!userMsg) {
    return await step.next();
  }

  // check agent command
  const cmd = AGENT_COMMAND_ARR.find((c) => userMsg.startsWith(c.command));
  if (cmd) {
    logFunc(`Found agent command - userMsg: ${userMsg} - cmd: ${cmd.key}`);
    const msgArr = userMsg.split(' ').filter((c) => c && c.trim());

    switch (cmd.key) {
      case AGENT_COMMAND.LOGIN:
        if (msgArr.length != 2) {
          logFunc(`User msg is invalid with LOGIN command - userMsg: "${userMsg}"`);
          return await step.next();
        }
        const agentState = {
          agentId: msgArr[1],
          agentBotId: agentBotId,
          agentChannelId,
          agentClientId,
          agentActivity: activity,
        };
        addAgentState(agentState);

        logFunc(`Login agent state successfully - data: ${JSON.stringify(agentState)}`);

        saveAgentState();

        return helper.endConversation(
          step,
          `Login agent ${agentState.agentId} successfully.\nReady to receive user's chat.\nYou can type @LOGOUT to sign out.`
        );

      case AGENT_COMMAND.LOGOUT:
        agentStateArr = agentStateArr.filter(
          (c) => !(c.agentClientId == agentClientId && c.agentChannelId == agentChannelId)
        );

        logFunc(`Logout agent state successfully - agentClientId: ${agentClientId} - channelId: ${agentChannelId}`);

        saveAgentState();

        return helper.endConversation(
          step,
          `Logout successfully.\nDo not transfer the user's conversation to you anymore.\nYou can type @LOGIN {AGENT_ID} to sign in. Example: @LOGIN 50012.`
        );

      case AGENT_COMMAND.GUIDE:
        return helper.endConversation(step, guideMsg);

      default:
        return await step.next();
    }
  }

  // check agent reply to user
  const userBelongToAgent = agentStateArr.find(
    (c) =>
      c.agentChannelId == agentChannelId && c.agentClientId == agentClientId && c.userId && c.userChannelId && c.userBotId
  );

  // send msg to user
  if (userBelongToAgent) {
    const { userId, agentId } = userBelongToAgent;

    const user = userUtils.find(userId);
    if (user) {
      await sendProactiveMsg(adapter, user.activity, userMsg);

      // send msg to other agent client
      const otherAgentClientState = agentStateArr.filter((c) => c.agentId == agentId && c.agentClientId != agentClientId);

      for (let item of otherAgentClientState) {
        try {
          const { agentActivity } = item;
          await sendProactiveMsg(adapter, agentActivity, userMsg);
        } catch (e) {
          logFunc(
            `Send agent's msg to another agent's client failed - originClient: ${agentClientId} - anotherClient: ${item.agentClientId} - err: ${e.message}`
          );
        }
      }
    }

    logFunc(`Agent send msg to user - agentState: ${JSON.stringify(userBelongToAgent)} - agent msg: ${userMsg}`);

    return await helper.endConversation(step);
  }

  // normal msg
  return await step.next();
};

const sendUserMsgToAgent = async (user, msg, adapter) => {
  if (!process.env.ENABLE_AGENT_CLIENT) return;

  const { id, activity, agentID } = user;
  const userChannelId = activity.channelId;
  const userBotId = activity.recipient.id;

  const existAgentState = agentStateArr.filter(
    (c) => c.agentId == agentID && c.userId == id && c.userChannelId == userChannelId && c.userBotId == userBotId
  );

  if (!existAgentState || !existAgentState.length) {
    return logFunc(
      `Could not found agent state to send user's msg to agent - userId: ${id} - agentID: ${agentID} - msg: ${msg} - existAgentStateCount: ${existAgentState.length} => not send msg to agent client`
    );
  }

  for (let item of existAgentState) {
    try {
      const { agentActivity } = item;
      await sendProactiveMsg(adapter, agentActivity, msg);
    } catch (e) {
      logFunc(
        `Send user's msg to agent failed - userId: ${id} - msg: ${msg} - agentState: ${JSON.stringify(item)} - err: ${
          e.message
        }`
      );
    }
  }
};

const assignUserToAgentState = async (user, adapter) => {
  if (!process.env.ENABLE_AGENT_CLIENT) return;

  const { id, agentID, activity } = user;

  const existAgentState = agentStateArr.filter((c) => c.agentId == agentID);
  if (!existAgentState || !existAgentState.length) {
    return logFunc(
      `Could not found data to assign user to agent state - userId: ${id} - userAgent: ${agentID} => not update agent state`
    );
  }

  //found agent state
  for (let item of existAgentState) {
    try {
      item.userId = id;
      item.userChannelId = activity.channelId;
      item.userBotId = activity.recipient.id;

      const { agentActivity } = item;

      await sendProactiveMsg(adapter, agentActivity, `You connected with user ${id}`);
    } catch (e) {
      logFunc(
        `Set user id to agent state failed - userData: ${JSON.stringify(id, agentID)} - agentState: ${JSON.stringify(
          item
        )} - err: ${e.message}`
      );
    }
  }
  saveAgentState();
  logFunc(`Assign user to agent state successful - agentStateCount: ${existAgentState.length}`);
};

const revokeUserFromAgentState = async (user, adapter) => {
  if (!process.env.ENABLE_AGENT_CLIENT) return;

  const { id, agentID, activity } = user;

  const existAgentState = agentStateArr.filter(
    (c) =>
      c.agentId == agentID && c.userId == id && c.userChannelId == activity.channelId && c.userBotId == activity.recipient.id
  );
  if (!existAgentState || !existAgentState.length) {
    return logFunc(
      `Could not found data to revoke user from agent state - userId: ${id} - userAgent: ${agentID} => not update agent state`
    );
  }

  for (let item of existAgentState) {
    try {
      item.userId = '';
      item.userChannelId = '';
      item.userBotId = '';

      const { agentActivity } = item;

      await sendProactiveMsg(adapter, agentActivity, `You disconnected with user ${id}`);
    } catch (e) {
      logFunc(
        `Set user id to agent state failed - userData: ${JSON.stringify(id, agentID)} - agentState: ${JSON.stringify(
          item
        )} - err: ${e.message}`
      );
    }
  }
  saveAgentState();
  logFunc(`Revoke user to agent state successful - agentStateCount: ${existAgentState.length}`);
};

const sendProactiveMsg = async (adapter, activity, message) => {
  const conversationReference = TurnContext.getConversationReference(activity);
  return await adapter.continueConversation(conversationReference, async (context) => {
    await context.sendActivity(message);
  });
};

module.exports = {
  sendAgentMsgToUser,
  sendUserMsgToAgent,
  assignUserToAgentState,
  revokeUserFromAgentState,
};
