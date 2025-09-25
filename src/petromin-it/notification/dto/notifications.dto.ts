import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterToken {
  @IsNotEmpty()
  @IsString()
  customer_id: string;

  @IsNotEmpty()
  @IsString()
  token: string;

  @IsOptional()
  @IsString()
  platform?: string; // 'ios' or 'android'
}

export class SendNotification {
  @IsNotEmpty()
  @IsString()
  customer_id: string;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  body: string;
}
