import { Transform } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsEnum } from 'class-validator';
import { FuelTypes, Transmissions } from '../entities/variant.enum';

/**
 * Data transfer object for retrieving vehicle variants/trims for specific models
 * Used to fetch all variants associated with particular model IDs and optional years
 * Supports filtering by transmission ID and fuel type ID
 * Complete the Make-Year-Model-Variant hierarchy for vehicle data queries
 */
export class GetVariantsDto {
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map(Number) : [Number(value)],
  )
  @IsArray()
  @IsInt({ each: true })
  modelIds: number[];

  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map(Number)
      : value
        ? [Number(value)]
        : undefined,
  )
  @IsArray()
  @IsInt({ each: true })
  years?: number[];

  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map(Number)
      : value
        ? [Number(value)]
        : undefined,
  )
  @IsArray()
  @IsEnum(Transmissions, { each: true })
  transmission?: Transmissions[];

  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map(Number)
      : value
        ? [Number(value)]
        : undefined,
  )
  @IsArray()
  @IsEnum(FuelTypes, { each: true })
  fuelType?: FuelTypes[];
}
