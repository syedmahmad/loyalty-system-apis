import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class TerminalItemDto {
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

export class BulkCreateTerminalsDto {
  @IsInt()
  @IsNotEmpty()
  tenant_partner_integration_id: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TerminalItemDto)
  terminals: TerminalItemDto[];
}
