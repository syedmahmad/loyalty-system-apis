import {
  IsString,
  IsNumber,
  IsBoolean,
  ValidateNested,
  IsArray,
  IsUUID,
  IsDateString,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CarListingUserDto {
  @IsUUID()
  customer_id: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  emailAddress?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;
}

export class CarListingImageDto {
  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isProfileImage?: boolean;
}

export class CreateCarListingDto {
  @IsNumber()
  languageId: number;

  @IsString()
  modelYear: string;

  @IsNumber()
  modelYearCode: number;

  @IsString()
  make: string;

  @IsNumber()
  makeCode: number;

  @IsString()
  model: string;

  @IsNumber()
  modelCode: number;

  @IsString()
  trim: string;

  @IsNumber()
  trimCode: number;

  @IsNumber()
  cityId: number;

  @IsNumber()
  askingPrice: number;

  @IsString()
  plate_no: string;

  @IsString()
  odometerReading: string;

  @IsBoolean()
  isPriceNegotiable: boolean;

  // Nested User DTO
  @ValidateNested()
  @Type(() => CarListingUserDto)
  user: CarListingUserDto;

  // Nested Images DTO
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CarListingImageDto)
  images: CarListingImageDto[];
}

export class MarkVehicleSoldDto {
  @IsString()
  plate_no: string;

  @IsUUID()
  customerId: string;
}
