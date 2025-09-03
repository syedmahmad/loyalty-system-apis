import { IsString, Matches } from 'class-validator';

export class GetOtpDto {
  @Matches(/^(\+9665\d{8}|\+92\d{10}|\+91\d{10})$/, {
    message:
      'Phone must be a valid number from Saudi (+9665XXXXXXXX), Pakistan (+92XXXXXXXXXX), or India (+91XXXXXXXXXX)',
  })
  mobileNumber: string;
}

export class VerifyOtpDto {
  @IsString()
  otp: string;

  @Matches(/^(\+9665\d{8}|\+92\d{10}|\+91\d{10})$/, {
    message:
      'Phone must be a valid number from Saudi (+9665XXXXXXXX), Pakistan (+92XXXXXXXXXX), or India (+91XXXXXXXXXX)',
  })
  mobileNumber: string;
}
