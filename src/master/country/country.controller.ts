import { Controller, Get, Param, Query } from '@nestjs/common';

import { CountryService } from './country.service';
import { CountryListDto, CountryParamsDto } from './dto/country.dto';

@Controller('master/country')
export class CountryController {
  constructor(private readonly countryService: CountryService) {}

  @Get()
  getCountries(@Query() query: CountryListDto) {
    return this.countryService.getCountries(query);
  }

  @Get('sync')
  sync() {
    return this.countryService.sync();
  }

  @Get(':id')
  getCountryById(@Param() params: CountryParamsDto) {
    return this.countryService.findById(params);
  }
}
