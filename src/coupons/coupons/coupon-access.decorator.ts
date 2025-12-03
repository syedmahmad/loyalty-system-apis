import { SetMetadata } from '@nestjs/common';

export const COUPON_ACCESS_KEY = 'coupon_access';
export const CouponAccess = () => SetMetadata(COUPON_ACCESS_KEY, true);
