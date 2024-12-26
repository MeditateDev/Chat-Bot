/* eslint-disable indent */
/* eslint-disable no-useless-constructor */
const { BotCallbackHandlerKey, ActivityTypes, Channels, INVOKE_RESPONSE_KEY } = require('botbuilder-core');
const { BotFrameworkAdapter } = require('botbuilder');
const { delay } = require('botbuilder-stdlib');
const { TokenResolver } = require('botbuilder/lib/streaming');
const { validateAndFixActivity } = require('botbuilder/lib/activityValidator');
const { AppCredentials } = require('botframework-connector');

function parseRequest(req) {
  return new Promise((resolve, reject) => {
    if (req.body) {
      try {
        const activity = validateAndFixActivity(req.body);
        resolve(activity);
      } catch (err) {
        reject(err);
      }
    } else {
      let requestData = '';
      req.on('data', (chunk) => {
        requestData += chunk;
      });
      req.on('end', () => {
        try {
          req.body = JSON.parse(requestData);
          const activity = validateAndFixActivity(req.body);
          resolve(activity);
        } catch (err) {
          reject(err);
        }
      });
    }
  });
}

class CustomAdapter extends BotFrameworkAdapter {
  constructor() {
    super();
  }
  async processActivity(req, res, logic) {
    const request = await parseRequest(req);

    const context = this.createContext(request);
    context.turnState.set(BotCallbackHandlerKey, logic);
    await this.runMiddleware(context, logic);
    res.status(200).json({ success: true, error: '' });
  }

  async sendActivities(context, activities) {
    const responses = [];
    if (!activities.length) return [{ success: true, message: 'No activities were received' }];
    for (let i = 0; i < activities.length; i++) {
      const activity = activities[i];

      switch (activity.type) {
        case 'delay':
          await delay(typeof activity.value === 'number' ? activity.value : 1000);
          responses.push({});
          break;
        case ActivityTypes.InvokeResponse:
          context.turnState.set(INVOKE_RESPONSE_KEY, activity);
          responses.push({});
          break;
        default:
          if (!activity.serviceUrl) {
            throw new Error(`BotFrameworkAdapter.sendActivity(): missing serviceUrl.`);
          }
          if (!activity.conversation || !activity.conversation.id) {
            throw new Error(`BotFrameworkAdapter.sendActivity(): missing conversation id.`);
          }
          if (activity && BotFrameworkAdapter.isStreamingServiceUrl(activity.serviceUrl)) {
            if (!this.isStreamingConnectionOpen) {
              throw new Error(
                'BotFrameworkAdapter.sendActivities(): Unable to send activity as Streaming connection is closed.'
              );
            }
            TokenResolver.checkForOAuthCards(this, context, activity);
          }
          const client = this.getOrCreateConnectorClient(context, activity.serviceUrl, this.credentials);
          const options = {
            customHeaders: {
              Authorization: process.env.AUTHORIZATION_TOKEN,
            },
          };
          if (activity.type === ActivityTypes.Trace && activity.channelId !== Channels.Emulator) {
            responses.push({});
          } else if (activity.replyToId) {
            const data = await client.conversations.replyToActivity(
              activity.conversation.id,
              activity.replyToId,
              activity,
              options,
              function (any, body, request, response) {
                return { ...response };
              }
            );
            responses.push(data);
          } else {
            responses.push(await client.conversations.sendToConversation(activity.conversation.id, activity, options));
          }
          break;
      }
    }
    return responses;
  }

  async executeFlow(activity, logic) {
    const context = this.createContext(activity);
    context.turnState.set(BotCallbackHandlerKey, logic);
    await this.runMiddleware(context, logic);
  }
}

module.exports = { CustomAdapter };
