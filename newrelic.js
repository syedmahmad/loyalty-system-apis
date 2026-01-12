'use strict';
/**
 * New Relic agent configuration.
 */
exports.config = {
  app_name: [process.env.NEW_RELIC_APP_NAME],
  /**
   * Your New Relic license key.
   */
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  distributed_tracing: { enabled: true },
  logging: {
    level: 'info',
  },
  allow_all_headers: true,
  attributes: {
    enabled: true,
  },
};
