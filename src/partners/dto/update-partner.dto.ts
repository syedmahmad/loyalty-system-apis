import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';

export class UpdatePartnerDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  logo_url?: string;

  @IsInt()
  @Min(0)
  @Max(1)
  @IsOptional()
  is_active?: number;
}
