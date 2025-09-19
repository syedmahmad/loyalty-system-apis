import { Transform } from 'class-transformer';
import { IsArray, IsInt, IsOptional } from 'class-validator';

/**
 * Data transfer object for retrieving available years for one or more makes
 */
export class GetYearsDto {
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map(Number) : [Number(value)],
  )
  @IsArray()
  @IsInt({ each: true })
  makeIds: number[];
}

/**
 * Data transfer object for retrieving vehicle models with optional filtering
 * Supports filtering by multiple make IDs and years
 */
export class GetModelsDto {
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
  makeIds?: number[];

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
}
