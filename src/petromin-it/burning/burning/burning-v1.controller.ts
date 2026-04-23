import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseFilters,
  ValidationPipe,
} from '@nestjs/common';
import { BurningService } from './burning.service';
import {
  BurnTransactionDto,
  ConfirmBurnDto,
  GenerateOtpDto,
  GetCustomerDataDto,
  VerifyOtpDto,
} from '../dto/burning.dto';
import { BurningV1ExceptionFilter } from './burning-v1-exception.filter';

@UseFilters(BurningV1ExceptionFilter)
@Controller('v1/burning')
export class BurningV1Controller {
  constructor(private readonly burningService: BurningService) {}

  @Post('getCustomerData')
  @HttpCode(HttpStatus.OK)
  async getCustomerData(
    @Body(new ValidationPipe({ whitelist: true })) dto: GetCustomerDataDto,
  ) {
    return this.burningService.getCustomerData(dto);
  }

  @Post('request-transaction')
  @HttpCode(HttpStatus.OK)
  async burnTransaction(
    @Body(new ValidationPipe({ whitelist: true }))
    burnTransactionDto: BurnTransactionDto,
  ) {
    return this.burningService.burnTransaction(burnTransactionDto);
  }

  @Post('confirm-transaction')
  @HttpCode(HttpStatus.OK)
  async confirmBurn(
    @Body(new ValidationPipe({ whitelist: true })) body: ConfirmBurnDto,
  ) {
    return this.burningService.confirmBurnTransaction(body);
  }

  @Post('otp/generate')
  @HttpCode(HttpStatus.OK)
  async generateOtp(
    @Body(new ValidationPipe({ whitelist: true })) dto: GenerateOtpDto,
  ) {
    return this.burningService.generateOtp(dto);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body(new ValidationPipe({ whitelist: true })) dto: VerifyOtpDto,
  ) {
    return this.burningService.verifyOtp(dto);
  }
}
