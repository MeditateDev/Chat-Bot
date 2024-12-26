const service = require('./services/service');
const { formatPhoneNumber } = require('./util/helper');

module.exports = {
  authenticate: (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader && authHeader != process.env.AUTHORIZATION_TOKEN) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }
    next();
  },
  handleProactiveMessageBody: async (req, res, next) => {
    let { callerNumber, phoneNumber, callFlowId, attribute } = req.body;

    console.log(`Proactive message body : ${JSON.stringify(req.body)}`);

    if (!callerNumber || !phoneNumber || !callFlowId) {
      return res.status(400).json({ success: false, error: 'Bad request' });
    }

    let { channelId } = (await service.getChannel(callerNumber)) || {};

    if (!channelId) {
      return res.status(400).json({
        success: false,
        error: `Cant find any channelId match with phone number ${callerNumber}`,
      });
    }

    phoneNumber = formatPhoneNumber(phoneNumber, channelId);

    req.body = {
      channelId: channelId,
      attribute: attribute,
      type: 'event',
      recipient: {
        id: `${channelId}${phoneNumber}-${callerNumber}`,
        name: phoneNumber,
      },
      name: 'proactiveMessageTrigger',
      conversation: {
        id: `${channelId}${phoneNumber}-${callerNumber}`,
      },
      callFlowId: callFlowId,
      from: {
        id: callerNumber,
        name: 'Bot',
      },
      serviceUrl: process.env.SERVICE_URL,
    };

    return next();
  },
};
