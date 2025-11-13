import { ArrayMinSize, IsArray, IsNotEmpty, IsString } from 'class-validator';

/**
 * Data Transfer Object for text translation requests
 * Supports flexible input types and multiple target languages
 */
export class TranslationDto {
  @IsNotEmpty()
  text: string | object | string[];

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  targetLanguage: string[];

  @IsString()
  @IsNotEmpty()
  sourceLanguage?: string;
}
