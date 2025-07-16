import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  PendingMethod,
  ExpirationMethod,
} from '../entities/wallet-settings.entity';

export class CreateWalletSettingsDto {
  @IsInt()
  business_unit_id: number;

  @IsEnum(PendingMethod)
  pending_method: PendingMethod;

  @IsOptional()
  @IsInt()
  pending_days?: number;

  @IsEnum(ExpirationMethod)
  expiration_method: ExpirationMethod;

  @IsOptional()
  @IsString()
  expiration_value?: string; // Can be number of days or MM-DD format

  @IsBoolean()
  allow_negative_balance: boolean;

  @IsInt()
  created_by: number;
}
