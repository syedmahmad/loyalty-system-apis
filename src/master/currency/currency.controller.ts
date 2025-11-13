import { Controller, Get, Query } from '@nestjs/common';

import { CurrencyService } from './currency.service';
import { CurrencyListDto } from './dto/currency.dto';

@Controller('master/currency')
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  @Get()
  getCurrencies(@Query() query: CurrencyListDto) {
    return this.currencyService.getCurrencies(query);
  }

  @Get('sync')
  sync() {
    return this.currencyService.sync();
  }
}
