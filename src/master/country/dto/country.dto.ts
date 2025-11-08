import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export enum OnboardStatus {
  ONBOARDED = 'ONBOARDED',
  NOT_ONBOARDED = 'NOT_ONBOARDED',
}

export class CountryListDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  search?: string;

  @IsOptional()
  @IsEnum(OnboardStatus)
  onboardStatus?: OnboardStatus;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => Boolean(value))
  addressFormat?: boolean;
}

export class CountryParamsDto {
  @IsUUID()
  id: string;
}
