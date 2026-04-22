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

  /**
   * SAR value of 1 Qitaf point at redemption (burn rate).
   * Confirmed from live transaction: 500 points = 100 SAR → value = 0.2
   * Used to show the customer their SAR equivalent before confirming redemption.
   * Update if STC changes their redemption rate.
   */
  burnSarPerPoint: number;

  /**
   * Qitaf points earned per 1 SAR spent (earn rate).
   * Confirmed from live SMS: SAR 65 purchase → 6 points → rate = 0.1 pts/SAR
   * (65 × 0.1 = 6.5, STC rounds down to 6).
   * Used for display only — STC calculates the actual points on their side.
   * Update if STC changes their earn rate.
   */
  earnPointsPerSar: number;

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

  /**
   * When true, after a successful partial Qitaf redemption the system
   * automatically calls the STC earn/reward API with the remaining cash amount
   * (totalAmount − redeemedAmount) so the customer earns points on the portion
   * paid via cash or card.
   */
  autoEarnOnPartialRedemption?: boolean;

  /**
   * When true, internal Petromin loyalty points are awarded when a customer claims
   * an invoice that was (fully or partially) paid via STC Qitaf redemption.
   * Defaults to false — admin must explicitly enable this to award internal points
   * alongside STC points.
   */
  earnInternalPointsOnQitafRedemption?: boolean;
}
