import { IsEmail, IsNotEmpty, IsEnum } from 'class-validator';

export class CreateUserDto {
  @IsNotEmpty()
  tenantId: number;

  @IsEmail()
  email: string;

  @IsNotEmpty()
  password: string;

  @IsEnum(['admin', 'manager', 'viewer'])
  role: 'admin' | 'manager' | 'viewer';
}
