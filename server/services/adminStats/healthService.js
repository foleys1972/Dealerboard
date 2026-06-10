const { getSettingsRow } = require('../../db/systemSettings/settings');

async function getGlobalRtcPorts() {
  const defaults = {
    rtcMinPort: parseInt(process.env.RTC_MIN_PORT, 10) || 10000,
    rtcMaxPort: parseInt(process.env.RTC_MAX_PORT, 10) || 10200,
  };

  try {
    const settings = await getSettingsRow('global');
    const ports = settings?.ports;
    if (ports) {
      if (ports.rtcMinPort !== undefined) {
        defaults.rtcMinPort = parseInt(ports.rtcMinPort, 10) || defaults.rtcMinPort;
      }
      if (ports.rtcMaxPort !== undefined) {
        defaults.rtcMaxPort = parseInt(ports.rtcMaxPort, 10) || defaults.rtcMaxPort;
      }
    }
  } catch {}

  return defaults;
}

module.exports = {
  getGlobalRtcPorts,
};
