import { IsString, IsNotEmpty } from 'class-validator';

export class RewardHistoryDto {
  @IsString()
  @IsNotEmpty()
  mobile_number: string;

  @IsString()
  @IsNotEmpty()
  lang_code: string;
}
