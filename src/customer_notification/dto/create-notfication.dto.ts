import {
  IsInt,
  IsOptional,
  IsString,
  IsNotEmpty,
  IsDateString,
  IsArray,
} from 'class-validator';

export class CreateNotificationDto {
  @IsOptional()
  @IsInt()
  user_id?: number;

  @IsString()
  @IsNotEmpty()
  notification_type: string;

  @IsOptional()
  @IsInt()
  reference_id?: number;

  @IsOptional()
  is_read?: boolean;

  @IsOptional()
  @IsDateString()
  scheduled_at?: string; // ISO string

  @IsOptional()
  @IsInt()
  send_by?: number;

  @IsOptional()
  @IsArray()
  user_ids?: number[];

  // Free form JSON — accept object from request
  @IsOptional()
  notification_details?: Record<string, any>;

  // Optional FCM token to send immediately (single device)
  @IsOptional()
  @IsString()
  user_fcm_token?: string;

  // Notification title/body for firebase
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;
}
