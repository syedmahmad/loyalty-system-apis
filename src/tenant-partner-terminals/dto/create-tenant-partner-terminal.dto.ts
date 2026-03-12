import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTenantPartnerTerminalDto {
  @IsInt()
  @IsNotEmpty()
  tenant_partner_integration_id: number;

  @IsString()
  @IsNotEmpty()
  branch_id: string;

  @IsString()
  @IsNotEmpty()
  terminal_id: string;

  @IsString()
  @IsOptional()
  label?: string;
}
