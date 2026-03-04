import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateTenantPartnerTerminalDto {
  @IsString()
  @IsOptional()
  branch_id?: string;

  @IsString()
  @IsOptional()
  terminal_id?: string;

  @IsString()
  @IsOptional()
  label?: string;

  @IsInt()
  @Min(0)
  @Max(1)
  @IsOptional()
  is_active?: number;
}
