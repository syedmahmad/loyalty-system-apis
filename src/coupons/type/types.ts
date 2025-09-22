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

export enum CouponTypeName {
  VEHICLE_SPECIFIC = 1,
  USER_SPECIFIC = 2,
  PRODUCT_SPECIFIC = 3,
  GEO_TARGETED = 4,
  SERVICE_BASED = 5,
  BIRTHDAY = 6,
  REFERRAL = 7,
  TIER_BASED = 8,
  CASHBACK = 9,
  DISCOUNT = 10,
}
