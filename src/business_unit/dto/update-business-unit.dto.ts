import { IsIn, IsNumber, IsOptional } from 'class-validator';

export class UpdateBusinessUnitDto {
  name?: string;
  description?: string;
  location?: string;
  type?: string; // 'points' | 'otp'
  icon?: string | null;

  @IsOptional()
  @IsNumber()
  @IsIn([0, 1])
  status?: number;

  @IsOptional()
  @IsNumber()
  @IsIn([0, 1])
  redemption_enabled?: number;
}
