const amqp = require('amqplib/callback_api');
const dal = require('./service');
var heartBeat = 0;
var _conn, _ch;
var methods = {
  startHeartBeat: async function (cb) {
    const amqpModel = await dal.getAMQP();
    if (!amqpModel) {
      console.log(`Could not found amqp credentials => not listen rabbit mq`);
      return;
    }

    // get amqp from api
    if (amqpModel) {
      var urlRabbitMQ =
        'amqp://' + amqpModel.AMQPUser + ':' + amqpModel.AMQPPassword + '@' + amqpModel.AMQPHost + ':' + amqpModel.AMQPPort;

      var key = 'heartbeat@linkscope';
      amqp.connect(urlRabbitMQ, function (err, conn) {
        if (err) {
          console.log(`Can not listen rabbitmq - err: ${JSON.stringify(err)}`);
          return;
        }
        _conn = conn;
        conn.createChannel(function (err, ch) {
          _ch = ch;
          var ex = 'amq.direct';
          var heartbeatmsg = '{"AppID":"10","DestinationIP":"localhost"}';
          ch.assertExchange(ex, 'direct', {
            durable: true,
          });
          heartBeatInterval = setInterval(function () {
            ch.publish(ex, key, Buffer.from(heartbeatmsg));
          }, 10000);
          if (heartBeat < 1) {
            heartBeat++;
            console.log('[*] Sending heartbeat message: ' + heartbeatmsg);
          }
          if (cb) cb(conn);
        });
      });
    } else {
      console.log('Get amqp information failed');
    }
  },
  stopHeartBeat: function () {
    clearInterval(interval);
  },
  sendResetFQ: (callback) => {
    _conn.createChannel((err, channel) => {
      if (err) console.log(err);
      ch = channel;

      let routingKey = 'resetfq-result';
      let msg = 'Reset FQ from Chatbot';
      let ex = 'amq.direct';
      channel.assertExchange(ex, 'direct', {
        durable: true,
      });
      channel.assertQueue(
        '',
        {
          exclusive: true,
        },
        function (error2, q) {
          if (error2) {
            throw error2;
          }
          channel.bindQueue(q.queue, ex, routingKey, null, (err, ok) => {
            //send msg reset FQ to RabbitMQ
            //conn.createChannel((err, ch) => {
            if (err) console.log(err);
            let routingKey = 'resetfq';
            let msg = 'Reset FQ from Chatbot';
            let ex = 'amq.direct';
            channel.assertExchange(ex, 'direct', {
              durable: true,
            });
            channel.publish(ex, routingKey, Buffer.from(msg), {
              replyTo: 'resetfq-result',
            });

            //ch.close();
            //});
          });

          channel.consume(
            q.queue,
            function (msg) {
              //console.log(" [x] %s:'%s'", msg.fields.routingKey, msg.content.toString());
              console.log('resetfq-result: ' + msg.content.toString());
              callback(msg.content.toString());
              channel.deleteQueue(q.queue);
              channel.close();
            },
            {
              noAck: true,
            }
          );
        }
      );
    });
  },
  sendMsg: (routingKey, msg) => {
    try {
      if (!_ch) return;
      const ex = 'amq.direct';
      _ch.publish(ex, routingKey, Buffer.from(msg), {
        replyTo: 'resetfq-result',
      });
    } catch (ex) {
      console.log('sendRabbitMQ failed');
      console.log(ex.message);
    }
  },
  onReceivedMsg: (routingKey, cb) => {
    if (!_ch) return;
    const channel = _ch;
    const ex = 'amq.direct';
    try {
      channel.assertExchange(ex, 'direct', {
        durable: true,
      });
      channel.assertQueue(
        '',
        {
          exclusive: true,
        },
        function (error2, q) {
          if (error2) {
            throw error2;
          }
          channel.bindQueue(q.queue, ex, routingKey, null, (err, ok) => {
            if (err) {
              console.log(`binding queue with routing key failed`);
            }
            console.log(`listen message from routing key: ${routingKey}`);
            channel.consume(
              q.queue,
              function (msg) {
                if (cb) cb(msg);
              },
              {
                noAck: true,
              }
            );
          });
        }
      );
    } catch (ex) {
      console.log('onReceivedMsg error');
      console.log(ex.message);
    }
  },
};
module.exports = {
  ...methods,
};
