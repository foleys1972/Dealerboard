class SubscriberApiError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.name = 'SubscriberApiError';
    this.status = status;
    this.details = details;
  }
}

module.exports = { SubscriberApiError };
