import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerProfileService } from './profile/profile.service';
import { CustomerProfileController } from './profile/profile.controller';
import { Customer } from 'src/customers/entities/customer.entity';
import { OciService } from 'src/oci/oci.service';

@Module({
  imports: [TypeOrmModule.forFeature([Customer])],
  controllers: [CustomerProfileController],
  providers: [CustomerProfileService, OciService],
})
export class CustomerProfileModule {}
