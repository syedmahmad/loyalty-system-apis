import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from './customer_notifications.service';

@Injectable()
export class ScheduledNotificationsService {
  private readonly logger = new Logger(ScheduledNotificationsService.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  // Run every minute to process scheduled notifications.
  @Cron(CronExpression.EVERY_MINUTE)
  async processScheduled() {
    try {
      const due =
        await this.notificationsService.getDueScheduledNotifications(200);
      if (!due || due.length === 0) return;

      this.logger.log(
        `Found ${due.length} scheduled notifications to process.`,
      );

      for (const n of due) {
        try {
          // If the record has user_ids (broadcast), handle accordingly
          if (n.user_ids && n.user_ids.length) {
            // In this example we don't have tokens; actual implementation should resolve tokens from users table
            await this.notificationsService.broadcastNotification({
              user_ids: n.user_ids as number[],
              title:
                (n.notification_details?.title as string) ?? 'Notification',
              body: (n.notification_details?.body as string) ?? '',
              notification_type: n.notification_type,
              notification_details: n.notification_details ?? {},
              send_by: n.send_by ?? null,
            });
          } else {
            // Single user
            await this.notificationsService.sendNotification({
              user_id: n.user_id ?? undefined,
              title:
                (n.notification_details?.title as string) ?? 'Notification',
              body: (n.notification_details?.body as string) ?? '',
              notification_type: n.notification_type,
              notification_details: n.notification_details ?? {},
              send_by: n.send_by ?? null,
            });
          }

          // Mark scheduled processed: here we clear scheduled_at so it won't be reprocessed
          await this.notificationsService.markScheduledProcessed(n.id);
        } catch (err) {
          this.logger.error(
            `Failed processing scheduled notification ${n.id}`,
            err as any,
          );
        }
      }
    } catch (err) {
      this.logger.error('Scheduled processor failed', err as any);
    }
  }
}
