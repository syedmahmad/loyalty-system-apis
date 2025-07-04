import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ActiveStatus } from '../type/types';

class ConditionDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class CreateCouponTypeDto {
  @IsInt()
  @IsNotEmpty()
  tenant_id: number;

  @IsString()
  @IsNotEmpty()
  coupon_type: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConditionDto)
  conditions?: ConditionDto[];

  @IsOptional()
  @IsInt()
  @IsIn(Object.values(ActiveStatus))
  is_active?: number;

  @IsInt()
  @IsNotEmpty()
  created_by: number;

  @IsInt()
  @IsNotEmpty()
  updated_by: number;
}
