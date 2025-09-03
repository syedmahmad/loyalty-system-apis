import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class GetOtpDto {
  @IsNotEmpty()
  @Matches(/^(\+9665\d{8}|\+92\d{10}|\+91\d{10})$/, {
    message:
      'Phone must be a valid number from Saudi (+9665XXXXXXXX), Pakistan (+92XXXXXXXXXX), or India (+91XXXXXXXXXX)',
  })
  mobileNumber: string;

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

  @IsNotEmpty()
  @Matches(/^(\+9665\d{8}|\+92\d{10}|\+91\d{10})$/, {
    message:
      'Phone must be a valid number from Saudi (+9665XXXXXXXX), Pakistan (+92XXXXXXXXXX), or India (+91XXXXXXXXXX)',
  })
  mobileNumber: string;
}
