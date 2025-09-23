export class UpdatePreferencesDto {
  email_notification?: number; // 0 | 1
  whatsapp_notification?: number; // 0 | 1
  sms_notification?: number; // 0 | 1
  push_notification?: number; // 0 | 1
  location_access?: number; // 0 | 1
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
