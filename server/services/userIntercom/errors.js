class UserIntercomError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.name = 'UserIntercomError';
    this.status = status;
    this.details = details;
  }
}

module.exports = { UserIntercomError };
