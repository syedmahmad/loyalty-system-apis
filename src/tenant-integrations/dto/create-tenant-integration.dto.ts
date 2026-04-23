import { IsInt, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

export class CreateTenantIntegrationDto {
  @IsInt()
  @IsNotEmpty()
  tenant_id: number;

  @IsInt()
  @IsNotEmpty()
  partner_id: number;

  @IsObject()
  @IsOptional()
  configuration?: Record<string, any>;
}
