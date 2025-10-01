import { Type } from 'class-transformer';
import {
  WalletTransactionType,
  WalletTransactionStatus,
} from '../entities/wallet-transaction.entity';
import { IsEnum, IsNumber, IsOptional, IsString, IsInt } from 'class-validator';

export class CreateWalletTransactionDto {
  @IsInt()
  wallet_id: number;

  @IsInt()
  business_unit_id: number;

  @IsEnum(WalletTransactionType)
  type: WalletTransactionType;

  @IsEnum(WalletTransactionStatus)
  status: WalletTransactionStatus;

  @IsNumber()
  @Type(() => Number)
  amount: number;

  @IsNumber()
  @Type(() => Number)
  prev_available_points: number;

  @IsNumber()
  @Type(() => Number)
  points_balance: number;

  @IsOptional()
  @IsString()
  coupon_code?: string;

  @IsOptional()
  @IsString()
  source_type?: string;

  @IsOptional()
  @IsInt()
  source_id?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  created_by?: number;

  expiry_date?: Date;

  @IsInt()
  wallet_order_id?: number;
}
