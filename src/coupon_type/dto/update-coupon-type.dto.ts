import { PartialType } from '@nestjs/mapped-types';
import { CreateCouponTypeDto } from './create-coupon-type.dto';

export class UpdateCouponTypeDto extends PartialType(CreateCouponTypeDto) {
  updated_by?: number;
}
