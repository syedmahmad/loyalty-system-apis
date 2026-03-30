/**
 * Shape of the `configuration` JSON column for STC Qitaf integrations (partner_id = 1).
 *
 * Redemption timeout (60 s) and OTP validity (3 min) are STC-mandated constants and
 * must NOT be read from this config — hardcode them in the Qitaf service.
 */
export interface QitafConfig {
  // ── STC Account ──────────────────────────────────────────────────────────
  /** Partner identifier assigned by STC */
  stcPartnerId: string;

  /** Organisation's registered name with STC */
  organisation: string;

  /** Country of operation */
  country: string;

  /** Primary city of operation (optional) */
  city?: string;

  // ── STC API Credentials ───────────────────────────────────────────────────
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

  // ── SSL Certificate Tracking ──────────────────────────────────────────────
  /**
   * ISO date (YYYY-MM-DD) when the mTLS client certificate was generated.
   * Staging certs expire after 3 years; production after 5 years.
   * Used by the admin UI to track expiry and warn before renewal is needed.
   */
  sslCertGeneratedAt?: string;

  /** 'staging' | 'production' — determines the cert validity duration */
  sslEnvironment?: 'staging' | 'production';
}
