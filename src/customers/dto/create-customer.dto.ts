import { Type } from 'class-transformer';
import {
  IsString,
  IsEmail,
  IsDateString,
  IsIn,
  IsOptional,
  IsNotEmpty,
  Matches,
  ArrayNotEmpty,
  ValidateNested,
} from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  external_customer_id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @Matches(/^(\+9665\d{8}|\+923\d{9}|\+91\d{10})$/, {
    message:
      'Phone must be a valid number from Saudi (+9665XXXXXXXX), Pakistan (+923XXXXXXXXX), or India (+91XXXXXXXXXX)',
  })
  phone: string;

  @IsIn(['male', 'female', 'other']) // customize as needed
  gender: string;

  @IsDateString()
  DOB: Date;

  @IsIn([0, 1])
  @IsOptional()
  status?: 0 | 1;

  @IsString()
  city: string;

  @IsString()
  address: string;

  @IsString()
  @IsOptional()
  country: string;

  @IsString()
  @IsOptional()
  image_url: string;
}

export class BulkCreateCustomerDto {
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateCustomerDto)
  customers: CreateCustomerDto[];
}
