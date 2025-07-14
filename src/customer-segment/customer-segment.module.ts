import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerSegment } from './entities/customer-segment.entity';
import { User } from 'src/users/entities/user.entity';
import { Customer } from 'src/api/customers/entities/customer.entity';
import { CustomerSegmentsController } from './customer-segment/customer-segment.controller';
import { CustomerSegmentsService } from './customer-segment/customer-segment.service';
import { CustomerSegmentMember } from './entities/customer-segment-member.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CustomerSegment,
      CustomerSegmentMember,
      Customer,
      User,
    ]),
  ],
  controllers: [CustomerSegmentsController],
  providers: [CustomerSegmentsService],
})
export class CustomerSegmentsModule {}
