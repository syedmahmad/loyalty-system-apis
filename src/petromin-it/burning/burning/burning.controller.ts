import { Body, Controller, Post, ValidationPipe } from '@nestjs/common';
import { BurningService } from './burning.service';
import {
  BurnTransactionDto,
  ConfirmBurnDto,
  GenerateOtpDto,
  GetCustomerDataDto,
  VerifyOtpDto,
} from '../dto/burning.dto';

@Controller('burning')
export class BurningController {
  constructor(private readonly burningService: BurningService) {}

  // #region getCustomerData API
  /**
   * POST /burning/getCustomerData
   * This API accepts customer_unique_id and phone number,
   * then returns customer details, wallet points, transactions, and tier info.
   */
  @Post('getCustomerData')
  async getCustomerData(
    @Body(new ValidationPipe({ whitelist: true })) dto: GetCustomerDataDto,
  ) {
    return this.burningService.getCustomerData(dto);
  }
  // #endregion

  //#region Burn Transaction Endpoint
  /**
   * POST /burning/transaction
   *
   * Burns loyalty points based on customer and transaction details.
   */
  @Post('request-transaction')
  async burnTransaction(
    @Body(new ValidationPipe({ whitelist: true }))
    burnTransactionDto: BurnTransactionDto,
  ) {
    return this.burningService.burnTransaction(burnTransactionDto);
  }

  @Post('confirm-transaction')
  async confirmBurn(
    @Body(new ValidationPipe({ whitelist: true })) body: ConfirmBurnDto,
  ) {
    return this.burningService.confirmBurnTransaction(body);
  }
  //#endregion

  // ── OTP Burn Flow ─────────────────────────────────────────────────────────

  /**
   * POST /burning/otp/generate  (App-facing — no MAC JWT required)
   *
   * Customer selects points on the app burn screen and taps "Get OTP".
   * Returns a 6-digit OTP + expiry shown with a countdown timer on screen.
   * Only works when otp_burn_required = 1 on the tenant.
   */
  @Post('otp/generate')
  async generateOtp(
    @Body(new ValidationPipe({ whitelist: true })) dto: GenerateOtpDto,
  ) {
    return this.burningService.generateOtp(dto);
  }

  /**
   * POST /burning/otp/verify  (MAC-facing — requires Rusty JWT)
   *
   * Cashier types the OTP from the customer's screen.
   * Returns points_to_burn + discount_amount so MAC can proceed to
   * request-transaction with the exact authorised values.
   * OTP is marked used immediately — cannot be replayed.
   */
  @Post('otp/verify')
  async verifyOtp(
    @Body(new ValidationPipe({ whitelist: true })) dto: VerifyOtpDto,
  ) {
    return this.burningService.verifyOtp(dto);
  }
}
