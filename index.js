const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;
require('./util/logger');
const express = require('express');
const bodyParser = require('body-parser');
const { calBot: bot, adapter, handleAgentReply } = require('./bot');
const { authenticate, handleProactiveMessageBody } = require('./middleware');
const { service } = require('./services');

const port = process.env.PORT;

const app = express();

app.use(express.json({ limit: process.env.REQUEST_LIMIT || '2mb' }));
app.use(bodyParser.json({ limit: process.env.REQUEST_LIMIT || '2mb' }));
app.use(
  bodyParser.urlencoded({
    extended: true,
    limit: process.env.REQUEST_LIMIT || '2mb',
  })
);

app.post(process.env.VIRTUAL_PATH + '/api/proactive-message', authenticate, handleProactiveMessageBody, async (req, res) => {
  adapter.processActivity(req, res, async (context) => await bot.run(context));
});

app.post(process.env.VIRTUAL_PATH + '/api/replymessage', authenticate, handleAgentReply);

app.post(process.env.VIRTUAL_PATH + '/api/messages', authenticate, async (req, res) => {
  if (req.body.text && typeof req.body.text == 'string') {
    req.body.text = req.body.text
      .replace('Sent from your Twilio trial account - ', '')
      .replace('Test SMS using a RingCentral Developer account - ', '');
  }
  adapter.processActivity(req, res, async (context) => await bot.run(context));
});

app.post(process.env.VIRTUAL_PATH + '/api/reload-config', authenticate, async (req, res) => {
  const data = await service.getCallFlowSetting();

  if (!data) return res.status(500).send({ success: false, error: 'Bad request' });

  service.updateENV(data);

  service.reloadLogMode(data.botLogMode);

  return res.send({ success: true, error: '' });
});

app.get(process.env.VIRTUAL_PATH + '/api/current-config', authenticate, async (req, res) => {
  return res.send({ ...process.env });
});

app.get(process.env.VIRTUAL_PATH, async (req, res) => {
  return res.json({ message: 'Server is working' });
});

app.listen(port || 3978, () => {
  console.log(`Server is listening on port: ${port}`);
});
