const logger = require('../../utils/logger');
const { PlatformAdminError } = require('./errors');

function shouldSpawnRestartChild() {
  if (process.env.RESTART_SPAWN === 'false') return false;
  if (process.env.RESTART_SPAWN === 'true') return true;
  // PM2, systemd, Docker, etc. should restart the process after exit.
  if (process.env.pm_id !== undefined) return false;
  if (process.env.NODE_ENV === 'production') return false;
  return true;
}

function spawnRestartChild() {
  const { spawn } = require('child_process');
  const child = spawn(process.execPath, process.argv.slice(1), {
    detached: true,
    stdio: 'ignore',
    env: process.env,
    cwd: process.cwd(),
    windowsHide: true,
  });
  child.unref();
}

async function requestServerRestart(tradingIntercomServer) {
  if (!tradingIntercomServer || typeof tradingIntercomServer.shutdown !== 'function') {
    throw new PlatformAdminError(503, 'Server restart is not available on this node');
  }

  const spawnChild = shouldSpawnRestartChild();

  setTimeout(async () => {
    try {
      if (spawnChild) {
        spawnRestartChild();
        logger.info('Spawned replacement server process for GUI restart');
      } else {
        logger.info('GUI server restart requested; exiting for process manager');
      }
      await tradingIntercomServer.shutdown();
    } catch (error) {
      logger.error('Server restart failed during shutdown:', error?.message || error);
      process.exit(1);
    }
  }, 750);

  return {
    success: true,
    spawnChild,
    message: spawnChild
      ? 'Server is restarting. A new process will start shortly.'
      : 'Server is shutting down. Your process manager should restart it.',
  };
}

module.exports = {
  shouldSpawnRestartChild,
  requestServerRestart,
};
