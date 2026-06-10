class SubscriberError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.name = 'SubscriberError';
    this.status = status;
    this.details = details;
  }
}

module.exports = { SubscriberError };
