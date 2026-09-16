/**
 * Process-local MVP application metrics module.
 * Maintains lightweight in-memory counters for system observability without external storage.
 */
const metrics = {
  link_creations_total: 0,
  link_creation_errors_total: 0,
  redirects_total: 0,
  redirect_not_found_total: 0,
  redirect_inactive_total: 0,
  deactivations_total: 0,
  rate_limit_exceeded_total: 0,
  http_4xx_total: 0,
  http_5xx_total: 0,
};

/**
 * Increments an in-memory counter by 1.
 *
 * @param {string} metricName - Counter metric key
 */
function incrementMetric(metricName) {
  if (typeof metrics[metricName] === 'number') {
    metrics[metricName]++;
  }
}

/**
 * Returns a snapshot of current metric values.
 *
 * @returns {Object} Metric counters object
 */
function getMetrics() {
  return { ...metrics };
}

/**
 * Resets all metrics counters to zero (used during test isolation).
 */
function resetMetricsForTesting() {
  for (const key of Object.keys(metrics)) {
    metrics[key] = 0;
  }
}

module.exports = {
  incrementMetric,
  getMetrics,
  resetMetricsForTesting,
};
