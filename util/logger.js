const e = require('cors');
const moment = require('moment-timezone');
const winston = require('winston');
const { mailReport } = require('../services');

const logger =
  (process.env.DEVELOP_MODE === '0' || process.env.DEVELOP_MODE === '1' || !process.env.DEVELOP_MODE) &&
  winston.createLogger({
    format: winston.format.printf(({ level, message }) => {
      const timestamp = moment().format('DD-MMM-YY dddd HH:mm:ss A');
      return `[${timestamp} ${level.toLocaleUpperCase()}] : ${
        typeof message === 'object' ? JSON.stringify(message) : message
      }`;
    }),
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({
        dirname: 'Logs',
        filename: `error_${moment().format('MMDDYY_HHmm')}.log`,
        level: 'error',
        maxsize: process.env.MAX_LOG_SIZE || 20 * 1024 * 1024,
        maxFiles: process.env.MAX_FILES || 50,
        handleExceptions: true,
        handleRejections: true,
      }),
      new winston.transports.File({
        dirname: 'Logs',
        filename: `combine_${moment().format('MMDDYY_HHmm')}.log`,
        level: 'info',
        format: winston.format.combine(
          winston.format((info) => {
            if (info.level !== 'error') {
              return info;
            }
          })()
        ),
        maxsize: process.env.MAX_LOG_SIZE || 20 * 1024 * 1024,
        maxFiles: process.env.MAX_FILES || 100,
      }),
    ],
  });

['log', 'error', 'warn', 'info'].forEach((method) => {
  const originalMethod = console[method];
  // DEVELOP_MODE = 2
  console[method] = function () {
    const timestamp = moment().format('DD-MMM-YY dddd HH:mm:ss A');
    const modifiedArgs = Array.from(arguments).map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : arg));
    originalMethod.call(console, `[${timestamp}]`, ...modifiedArgs);
  };
  if (process.env.DEVELOP_MODE === '0') {
    console[method] = function () {
      if (method === 'log') return logger.info.apply(logger, arguments);
      if (method === 'info') return;
      return logger[method].apply(logger, arguments);
    };
  } else if (process.env.DEVELOP_MODE === '1' || !process.env.DEVELOP_MODE) {
    console[method] = function () {
      if (method === 'log') return logger.info.apply(logger, arguments);
      return logger[method].apply(logger, arguments);
    };
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  if (logger) {
    logger.error('Uncaught Exception:');
    logger.error(error.stack || error.message || error);
  } else {
    console.error('Uncaught Exception:');
    console.error(error.stack || error.message || error);
  }

  await mailReport.mailError({
    type: 'RUNTIME',
    message: error.message,
    stack: error.stack || error.message || error || 'No error stack',
  });
});

// Handle unhandled rejections
process.on('unhandledRejection', async (reason, promise) => {
  if (logger) {
    logger.error('Unhandled Rejection:');
    logger.error(reason.stack || reason.message || reason);
  } else {
    console.error('Unhandled Rejection:');
    console.error(reason.stack || reason.message || reason);
  }

  await mailReport.mailError({
    type: 'RUNTIME',
    message: reason.message,
    stack: reason.stack || reason.message || reason || 'No error stack',
  });
});
