import { IsOptional, IsString } from 'class-validator';

export class UpdateCustomerSegmentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
