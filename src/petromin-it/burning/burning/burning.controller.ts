import { Body, Controller, Post, ValidationPipe } from '@nestjs/common';
import { BurningService } from './burning.service';
import {
  BurnTransactionDto,
  ConfirmBurnDto,
  GetCustomerDataDto,
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
  //#endregion

  @Post('confirm-transaction')
  async confirmBurn(
    @Body(new ValidationPipe({ whitelist: true })) body: ConfirmBurnDto,
  ) {
    return this.burningService.confirmBurnTransaction(body);
  }
}
