export const ActiveStatus = {
  INACTIVE: 0,
  ACTIVE: 1,
  DELETED: 2,
  SUSPENDED: 3,
} as const;

export type ActiveStatusType = (typeof ActiveStatus)[keyof typeof ActiveStatus];

export enum CouponType {
  DISCOUNT = 'DISCOUNT',
  CASHBACK = 'CASHBACK',
  TIER_BASED = 'TIER_BASED',
  REFERRAL = 'REFERRAL',
  BIRTHDAY = 'BIRTHDAY',
  USAGE_BASED = 'USAGE_BASED',
  GEO_TARGETED = 'GEO_TARGETED',
  PRODUCT_SPECIFIC = 'PRODUCT_SPECIFIC',
  TIME_LIMITED = 'TIME_LIMITED',
}
