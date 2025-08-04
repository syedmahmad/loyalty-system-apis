import { IsNumber, IsString } from 'class-validator';

export class CreateCustomerActivityDto {
  @IsString()
  customer_uuid: string;

  @IsString()
  activity_type: 'coupon' | 'rule' | 'other'; // Adjust enum values as needed

  @IsNumber()
  campaign_id?: number;

  @IsNumber()
  coupon_id?: number;

  @IsNumber()
  amount: number;
}
