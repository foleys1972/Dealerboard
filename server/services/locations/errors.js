class LocationError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.name = 'LocationError';
    this.status = status;
    this.details = details;
  }
}

module.exports = { LocationError };
