import { IsOptional, IsString, IsObject } from 'class-validator';

export class CreateGVRTransactionSyncLogDto {
  @IsOptional()
  @IsString()
  status?: string; // default = "pending"

  @IsOptional()
  @IsObject()
  request_body?: any;

  @IsOptional()
  @IsObject()
  response_body?: any;
}
