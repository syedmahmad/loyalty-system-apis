import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreatePointDto {
  @IsInt()
  tenant_id: number;

  @IsInt()
  user_id: number;

  @IsInt()
  points: number;

  @IsString()
  @IsOptional()
  source?: string;
}
