import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CountryController } from './country/country.controller';
import { CountryService } from './country/country.service';
import { CurrencyController } from './currency/currency.controller';
import { CurrencyService } from './currency/currency.service';
import { CurrencyEntity } from './currency/entities/currency.entity';
import { CurrencyDataProvider } from './currency/utils/currency-data.provider';
import { LanguageEntity } from './language/entities/language.entity';
import { LanguageController } from './language/language.controller';
import { LanguageService } from './language/language.service';
import { LanguageDataProvider } from './language/utils/language-data.provider';
import { CountryEntity } from './country/entities/country.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CountryEntity, LanguageEntity, CurrencyEntity]),
    HttpModule,
    ConfigModule,
  ],
  controllers: [CountryController, LanguageController, CurrencyController],
  providers: [
    CountryService,
    LanguageService,
    CurrencyService,
    LanguageDataProvider,
    CurrencyDataProvider,
  ],
  exports: [CountryService, LanguageService, CurrencyService],
})
export class MasterModule {}
