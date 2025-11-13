import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsUUID,
  ArrayMinSize,
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
}
