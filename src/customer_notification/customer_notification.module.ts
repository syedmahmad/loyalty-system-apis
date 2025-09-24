import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { CustomerNotification } from './entities/customer_notification.entity';
import { NotificationsController } from './customer_notification/customer_notfication.controller';
import { NotificationsService } from './customer_notification/customer_notifications.service';
import { FirebaseService } from './customer_notification/firebase.service';
import { ScheduledNotificationsService } from './customer_notification/scheduled-notifications.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CustomerNotification]),
    ScheduleModule.forRoot(),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    FirebaseService,
    ScheduledNotificationsService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
