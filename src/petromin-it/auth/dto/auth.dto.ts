import {
  IsNotEmpty,
  IsString,
  Matches,
  IsOptional,
  IsBoolean,
  IsObject,
} from 'class-validator';

export class GetOtpDto {
  @IsNotEmpty()
  @Matches(/^(\+9665\d{8}|\+92\d{10}|\+91\d{10}|\+962\d{8,9})$/, {
    message:
      'Phone must be a valid number from Saudi (+9665XXXXXXXX), Pakistan (+92XXXXXXXXXX), India (+91XXXXXXXXXX), or Jordan (+962XXXXXXXXX)',
  })
  mobileNumber: string;

  // @IsString()
  // @IsOptional()
  // referral_code?: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^(en|ar)$/, {
    message: "language_code must be either 'en' or 'ar'",
  })
  language_code: 'en' | 'ar';
}

export class VerifyOtpDto {
  @IsNotEmpty()
  @IsString()
  otp: string;

  // @IsString()
  // @IsOptional()
  // referral_code?: string;

  @IsNotEmpty()
  @Matches(/^(\+9665\d{8}|\+92\d{10}|\+91\d{10}|\+962\d{8,9})$/, {
    message:
      'Phone must be a valid number from Saudi (+9665XXXXXXXX), Pakistan (+92XXXXXXXXXX), India (+91XXXXXXXXXX), or Jordan (+962XXXXXXXXX)',
  })
  mobileNumber: string;
}

export class RegisterFromSpareitDto {
  @IsNotEmpty()
  @IsString()
  phone_no: string;

  @IsOptional()
  @IsString()
  country_code?: string;

  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  firebase_token?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsObject()
  device_info?: {
    platform?: string;
    brand?: string;
    model?: string;
    os_version?: string;
  };

  @IsOptional()
  @IsBoolean()
  marketing_consent_status?: boolean;

  @IsOptional()
  @IsString()
  gender?: string;
}
