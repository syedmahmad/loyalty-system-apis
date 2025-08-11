import { IsInt, IsString, IsOptional, Min } from 'class-validator';

export class CreateTierDto {
  @IsInt()
  tenant_id: number;

  @IsString()
  name: string;

  @IsInt()
  @Min(0)
  min_points: number;

  @IsInt()
  @Min(0)
  max_points: number;

  @IsInt()
  business_unit_id: number;
  // @Min(0)
  // points_conversion_rate: number;

  @IsString()
  @IsOptional()
  benefits?: string[];

  created_by?: number;

  // rule_targets?: {
  //   rule_id: number;
  // }[];
}
