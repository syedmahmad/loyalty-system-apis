import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Param,
  Patch,
} from '@nestjs/common';
import { NotificationsService } from './customer_notifications.service';
import { CreateNotificationDto } from '../dto/create-notfication.dto';
import { ListNotificationsDto } from '../dto/list-notification.dto';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  // Send single notification (save + optional firebase token send)
  @Post('send')
  async send(@Body() dto: CreateNotificationDto) {
    return this.service.sendNotification({
      user_id: dto.user_id,
      title: dto.title ?? 'Notification',
      body: dto.body ?? '',
      notification_type: dto.notification_type,
      reference_id: dto.reference_id,
      notification_details: dto.notification_details,
      user_fcm_token: dto.user_fcm_token,
      send_by: dto.send_by,
    });
  }

  // Broadcast with user_ids (and optionally tokens)
  @Post('broadcast')
  async broadcast(@Body() dto: CreateNotificationDto & { tokens?: string[] }) {
    if (!dto.user_ids || dto.user_ids.length === 0) {
      return { error: 'user_ids required for broadcast' };
    }
    return this.service.broadcastNotification({
      user_ids: dto.user_ids,
      title: dto.title ?? 'Broadcast',
      body: dto.body ?? '',
      notification_type: dto.notification_type,
      notification_details: dto.notification_details,
      send_by: dto.send_by,
      tokens: (dto as any).tokens,
    });
  }

  // List user's notifications
  @Get()
  async list(@Query() query: ListNotificationsDto) {
    const page = Number(query.page ?? 1);
    const per_page = Number(query.per_page ?? 25);
    if (!query.user_id) return { error: 'user_id required' };
    return this.service.listNotifications(query.user_id, page, per_page);
  }

  // Mark one notification as read
  @Patch(':id/read')
  async markRead(@Param('id') id: string) {
    return this.service.markAsRead(Number(id));
  }

  // Mark all as read for user (very simple)
  @Patch('mark-all-read')
  async markAllRead(@Body() body: { user_id: number }) {
    return this.service.markAllAsReadForUser(body.user_id);
  }
}
