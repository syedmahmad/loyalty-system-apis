import { IsNotEmpty, IsString, IsOptional, IsInt, IsBoolean } from 'class-validator';

export class CreateRewardDto {
  @IsInt()
  tenant_idd: number;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  points_required: number;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
