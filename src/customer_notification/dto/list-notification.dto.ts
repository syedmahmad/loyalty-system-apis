import { IsOptional, IsInt, IsBooleanString } from 'class-validator';

export class ListNotificationsDto {
  @IsOptional()
  @IsInt()
  user_id?: number;

  @IsOptional()
  @IsBooleanString()
  is_read?: 'true' | 'false';

  @IsOptional()
  @IsInt()
  page?: number;

  @IsOptional()
  @IsInt()
  per_page?: number;
}
