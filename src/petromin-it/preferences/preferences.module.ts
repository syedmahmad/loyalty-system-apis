import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PreferencesController } from './preferences/preferences.controller';
import { PreferencesService } from './preferences/preferences.service';
import { Customer } from 'src/customers/entities/customer.entity';
import { CustomerPreference } from './entities/customer-preference.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, CustomerPreference])],
  controllers: [PreferencesController],
  providers: [PreferencesService],
})
export class PreferencesModule {}
