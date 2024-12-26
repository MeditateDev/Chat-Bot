class CustomError extends Error {
  constructor(message, ERROR_CODE, ERROR_MESSAGE) {
    super(message);

    this.message = message;
    this.ERROR_CODE = ERROR_CODE;
    this.ERROR_MESSAGE = ERROR_MESSAGE;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = { CustomError };
