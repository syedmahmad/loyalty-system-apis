import { IsOptional, IsString } from 'class-validator';

export class CreateQrcodeDto {
  @IsString()
  short_id: string;

  @IsString()
  @IsOptional()
  qr_code_base64?: string;
}
