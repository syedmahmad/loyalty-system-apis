import {
  IsString,
  IsNumber,
  IsBoolean,
  ValidateNested,
  IsArray,
  IsUUID,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CarListingUserDto {
  @IsUUID()
  customer_id: string;

  @IsString()
  phoneNumber: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  emailAddress: string;

  @IsString()
  gender: string;

  @IsDateString()
  dateOfBirth: string;
}

export class CarListingImageDto {
  @IsString()
  fileName: string;

  @IsString()
  imageUrl: string;

  @IsBoolean()
  isProfileImage: boolean;
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

  @IsString()
  askingPrice: string;

  @IsString()
  plate_no: string;

  @IsString()
  spec: string;

  @IsNumber()
  specCode: number;

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
