import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantsService } from './tenants/tenants.service';
import { TenantsController } from './tenants/tenants.controller';
import { Tenant } from './entities/tenant.entity';
import { User } from 'src/users/entities/user.entity';
import { CountryEntity } from 'src/master/country/entities/country.entity';
import { LanguageEntity } from 'src/master/language/entities/language.entity';
import { CurrencyEntity } from 'src/master/currency/entities/currency.entity';
import { TenantLanguageEntity } from './entities/tenant-language.entity';
import { TenantCurrencyEntity } from './entities/tenant-currency.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tenant,
      User,
      CountryEntity,
      LanguageEntity,
      CurrencyEntity,
      TenantLanguageEntity,
      TenantCurrencyEntity,
    ]),
  ],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
