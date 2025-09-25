import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { GetOtpDto, VerifyOtpDto } from 'src/petromin-it/auth/dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('get-otp')
  async getOtp(@Body() body: GetOtpDto): Promise<any> {
    return await this.authService.getOtp(body);
  }

  @Post('verify-otp')
  async verifyOtp(@Body() body: VerifyOtpDto): Promise<any> {
    return await this.authService.verifyOtp(body);
  }

  @Post('select-profile')
  async selectProfile(@Body() body: any): Promise<any> {
    const { phone_number, selected_customer } = body;
    return await this.authService.saveSelectedProfile(
      phone_number,
      selected_customer,
    );
  }
}
