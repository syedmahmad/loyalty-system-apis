import { Controller, Post, Body } from '@nestjs/common';
import {
  RegisterToken,
  SendNotification,
} from 'src/petromin-it/notification/dto/notifications.dto';
import { NotificationService } from 'src/petromin-it/notification/notification/notifications.service';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post('register-token')
  async registerToken(@Body() body: RegisterToken) {
    return this.notificationService.saveDeviceToken(body);
  }

  @Post('send')
  async sendNotification(@Body() body: SendNotification) {
    return this.notificationService.sendToUser(body);
  }
}
