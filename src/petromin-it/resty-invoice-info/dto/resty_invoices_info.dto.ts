import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateRestyInvoicesInfoDto {
  @IsString()
  invoice_number: string;

  @IsOptional()
  @IsString()
  invoice_date?: string;

  @IsOptional()
  @IsString()
  invoice_due_date?: string;

  @IsNumber()
  invoice_amount: number;

  @IsOptional()
  @IsString()
  invoice_currency?: string;

  @IsOptional()
  @IsString()
  invoice_status?: string;

  @IsOptional()
  @IsString()
  customer_name?: string;

  @IsOptional()
  @IsString()
  customer_phone?: string;

  @IsOptional()
  @IsString()
  customer_email?: string;

  @IsOptional()
  @IsString()
  customer_address?: string;

  // Claim fields
  @IsOptional()
  @IsString()
  claim_number?: string;

  @IsOptional()
  @IsString()
  claim_status?: string;

  @IsOptional()
  @IsNumber()
  claim_amount?: number;

  @IsOptional()
  @IsString()
  claim_date?: string;

  @IsOptional()
  @IsString()
  claim_type?: string;

  @IsOptional()
  @IsString()
  claim_description?: string;
}
