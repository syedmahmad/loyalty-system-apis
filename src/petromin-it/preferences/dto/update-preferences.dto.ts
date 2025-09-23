import { IsOptional } from 'class-validator';

export class UpdatePreferencesDto {
  @IsOptional()
  email_notification?: number; // 0 | 1
  @IsOptional()
  whatsapp_notification?: number; // 0 | 1
  @IsOptional()
  sms_notification?: number; // 0 | 1
  @IsOptional()
  push_notification?: number; // 0 | 1
  @IsOptional()
  location_access?: number; // 0 | 1
  @IsOptional()
  biometric?: number; // 0 | 1
}

export class PreferencesResponseDto {
  customer_id: string;
  email_notification: number;
  whatsapp_notification: number;
  sms_notification: number;
  push_notification: number;
  location_access: number;
  biometric: number;
}
