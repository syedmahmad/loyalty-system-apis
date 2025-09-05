import { IsString, IsUUID, Matches } from 'class-validator';

export class CustomerDto {
  @IsUUID()
  custom_customer_unique_id: string;

  @IsString()
  @Matches(/^(\+9665\d{8}|\+92\d{10}|\+91\d{10})$/, {
    message:
      'Phone must be a valid number from Saudi (+9665XXXXXXXX), Pakistan (+92XXXXXXXXXX), or India (+91XXXXXXXXXX)',
  })
  customer_phone_number: string;
}
