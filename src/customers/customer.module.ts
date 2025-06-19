import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomersService } from './customer.service';
import { CustomersController } from './customer.controller';
import { Customer } from 'src/customers/entities/customer.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Customer])],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
