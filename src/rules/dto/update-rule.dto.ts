import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsNumber, IsOptional } from 'class-validator';
import { CreateRuleDto } from './create-rule.dto';

export class UpdateRuleDto extends PartialType(CreateRuleDto) {
  updated_by: number;

  @IsOptional()
  @IsNumber()
  @IsIn([0, 1])
  status?: number;
}
