import { IsNumber, IsString } from 'class-validator';

export class CreateCustomerActivityDto {
  @IsString()
  customer_uuid: string;

  @IsString()
  activity_type: string;

  @IsString()
  campaign_uuid?: string;

  @IsNumber()
  coupon_id?: number;

  @IsNumber()
  amount: number;
}