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

  // ── Deprecated OTP Endpoints ──────────────────────────────────────────────
  // These routes are no longer part of the active burn flow.
  // OTP is now generated inside POST /burning/request-transaction and sent to
  // the customer via push notification. The customer shares the OTP with the
  // cashier who includes it in POST /burning/confirm-transaction as { otp: "..." }.

  /**
   * @deprecated Use POST /burning/request-transaction — it now generates and
   * pushes the OTP automatically when otp_burn_required = 1 on the tenant.
   */
  @Post('otp/generate')
  async generateOtp(
    @Body(new ValidationPipe({ whitelist: true })) dto: GenerateOtpDto,
  ) {
    const result = await this.burningService.generateOtp(dto);
    return {
      ...result,
      deprecated: true,
      deprecation_notice:
        'This endpoint is deprecated. OTP is now generated automatically inside request-transaction and delivered via push notification.',
    };
  }

  /**
   * @deprecated OTP verification is now handled inside POST /burning/confirm-transaction.
   * Pass { transaction_id, burn_point, otp } to confirm-transaction instead.
   */
  @Post('otp/verify')
  async verifyOtp(
    @Body(new ValidationPipe({ whitelist: true })) dto: VerifyOtpDto,
  ) {
    const result = await this.burningService.verifyOtp(dto);
    return {
      ...result,
      deprecated: true,
      deprecation_notice:
        'This endpoint is deprecated. Include the OTP in confirm-transaction as { transaction_id, burn_point, otp } instead.',
    };
  }
}
