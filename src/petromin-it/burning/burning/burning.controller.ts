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
   * Customer taps "Generate Redemption Code" on the app screen.
   * Returns a 6-digit OTP saved as unlinked (transaction_uuid = null).
   * When the cashier later calls request-transaction, the system detects
   * this pre-generated OTP and links it to the transaction automatically —
   * no new OTP is created and no push notification is fired.
   * If the customer did not pre-generate, request-transaction generates
   * a fresh OTP and delivers it via push notification instead.
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
   * Legacy standalone verify endpoint — kept for backwards compatibility.
   * In the current flow, OTP verification is handled inside confirm-transaction.
   */
  @Post('otp/verify')
  async verifyOtp(
    @Body(new ValidationPipe({ whitelist: true })) dto: VerifyOtpDto,
  ) {
    return this.burningService.verifyOtp(dto);
  }
}
