import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class tierBenefitsDto {
  @IsOptional()
  @IsString()
  @Matches(/^(en|ar)$/, {
    message: "language_code must be either 'en' or 'ar'",
  })
  language_code: 'en' | 'ar' = 'en';

  @IsNotEmpty()
  customerId: string;

  @IsNotEmpty()
  @IsNumber()
  tenantId: number;

  @IsNotEmpty()
  BUId: string;
}
