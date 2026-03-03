import { IsInt, IsOptional, IsObject, Min, Max } from 'class-validator';

export class UpdateTenantIntegrationDto {
  @IsInt()
  @Min(0)
  @Max(1)
  @IsOptional()
  is_enabled?: number;

  @IsObject()
  @IsOptional()
  configuration?: Record<string, any>;
}
