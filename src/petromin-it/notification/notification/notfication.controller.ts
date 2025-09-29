import { Controller, Post, Body, Get, Query, Patch } from '@nestjs/common';
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

  /**
   * ✅ Get all notifications for a specific user
   * Params:
   * - customer_id (uuid)
   * - page (default 1)
   * - offset (default 10)
   * - language_code (optional)
   */
  @Get()
  async getUserNotifications(
    @Query('customer_id') customer_id: string,
    @Query('page') page = 1,
    @Query('offset') offset = 10,
    @Query('language_code') language_code: string = 'en',
  ) {
    return this.notificationService.getUserNotifications(
      customer_id,
      Number(page),
      Number(offset),
      language_code,
    );
  }

  @Patch('mark-read')
  async markNotificationRead(
    @Body() body: { customer_id: string; notification_id: string },
  ) {
    return this.notificationService.markAsRead(
      body.customer_id,
      body.notification_id,
    );
  }
}
