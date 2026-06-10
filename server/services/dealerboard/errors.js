class LineOperationError extends Error {
  constructor(status, message, details = undefined, extra = undefined) {
    super(message);
    this.name = 'LineOperationError';
    this.status = status;
    this.details = details;
    this.extra = extra;
  }
}

module.exports = { LineOperationError };
