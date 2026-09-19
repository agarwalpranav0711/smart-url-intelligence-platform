/**
 * Application shutdown readiness state holder.
 * Tracks process lifecycle when SIGTERM or SIGINT signal is received.
 */
let isShuttingDown = false;

function setShuttingDown(flag = true) {
  isShuttingDown = flag;
}

function getShuttingDown() {
  return isShuttingDown;
}

module.exports = {
  setShuttingDown,
  getShuttingDown,
};
