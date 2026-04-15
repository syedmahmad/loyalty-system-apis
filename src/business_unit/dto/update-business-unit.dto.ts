import { IsIn, IsNumber, IsOptional } from 'class-validator';

export class UpdateBusinessUnitDto {
  name?: string;
  description?: string;
  location?: string;

  @IsOptional()
  @IsNumber()
  @IsIn([0, 1])
  status?: number;
}
