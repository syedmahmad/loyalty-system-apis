import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerService } from './customer.service';
import { CustomerController } from './customer.controller';
import { Customer } from 'src/api/customers/entities/customer.entity';
import { User } from 'src/users/entities/user.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { BusinessUnitMiddleware } from 'src/business_unit/middleware/business_unit.middleware';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, User, BusinessUnit])],
  controllers: [CustomerController],
  providers: [CustomerService, BusinessUnitMiddleware],
})
export class CustomerModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(BusinessUnitMiddleware).forRoutes({
      path: 'customers',
      method: RequestMethod.POST,
    });
  }
}
