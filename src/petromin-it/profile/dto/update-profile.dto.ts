import {
  IsEmail,
  IsOptional,
  IsString,
  IsDateString,
  IsUrl,
  IsNotEmpty,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  country_code?: string;

  @IsOptional()
  @IsDateString()
  DOB?: Date;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  custom_city?: string;

  @IsOptional()
  city_id?: number;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsUrl()
  image_url?: string;
}

export class RequestDeletionDto {
  @IsOptional()
  @IsString()
  reason_for_deletion?: string;

  @IsOptional()
  @IsString()
  reason_for_deletion_other?: string;
}

export class ReferByDto {
  @IsNotEmpty()
  @IsString()
  customer_id: string;

  @IsNotEmpty()
  @IsString()
  referral_code: string;
}
