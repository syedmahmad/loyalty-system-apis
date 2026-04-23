import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsUUID,
  ArrayMinSize,
  IsOptional,
  IsInt,
  Min,
} from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  domain: string;

  @IsUUID('4')
  country_id: string;

  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  languageIds?: string[];

  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  currencyIds?: string[];

  @IsOptional()
  @IsInt()
  otp_burn_required?: number; // 0 = disabled, 1 = enabled

  @IsOptional()
  @IsInt()
  @Min(1)
  otp_burn_ttl_minutes?: number;
}
