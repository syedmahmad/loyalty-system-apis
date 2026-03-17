/**
 * Shape of the `configuration` JSON column for STC Qitaf integrations (partner_id = 1).
 *
 * SSL/mTLS certificates are managed at the server/infrastructure level (env vars or
 * the filesystem) — they are NOT stored per-tenant in this config.
 *
 * Redemption timeout (60 s) and OTP validity (3 min) are STC-mandated constants and
 * must NOT be read from this config — hardcode them in the Qitaf service.
 */
export interface QitafConfig {
  /** X-Secret-Token header value provided by STC */
  secretToken: string;

  /** Basic Auth username provided by STC */
  authUsername: string;

  /** Basic Auth password provided by STC */
  authPassword: string;

  /** STC Qitaf web service base URL */
  apiBaseUrl: string;

  /** SAR-to-QitafPoint conversion ratio agreed with STC */
  pointToAmountRatio: number;

  /**
   * Number of days after a transaction before points are posted.
   * Points are withheld during the partner's refund window.
   */
  refundPeriodDays: number;
}
