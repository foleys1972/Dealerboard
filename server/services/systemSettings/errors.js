class SystemSettingsError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.name = 'SystemSettingsError';
    this.status = status;
    this.details = details;
  }
}

module.exports = { SystemSettingsError };
