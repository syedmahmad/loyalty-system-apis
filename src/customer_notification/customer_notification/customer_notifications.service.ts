import { Injectable, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { FirebaseService } from './firebase.service';
import { CustomerNotification } from '../entities/customer_notification.entity';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(CustomerNotification)
    private readonly repo: Repository<CustomerNotification>,
    private readonly firebaseService: FirebaseService,
  ) {}

  // Create notification record (does not attempt to send)
  async createNotification(
    dto: Partial<CustomerNotification>,
  ): Promise<CustomerNotification> {
    const entity: any = this.repo.create({
      ...dto,
      is_read: dto.is_read ?? false,
    } as any);
    return await this.repo.save(entity);
  }

  // Send notification to a single user (save + optionally send firebase using token)
  async sendNotification(payload: {
    user_id?: number;
    title: string;
    body: string;
    notification_type: string;
    reference_id?: number;
    notification_details?: Record<string, any>;
    user_fcm_token?: string;
    send_by?: number;
  }) {
    const {
      user_fcm_token,
      title,
      body,
      user_id,
      notification_type,
      reference_id,
      notification_details,
      send_by,
    } = payload;

    // Save notification record
    const record = await this.createNotification({
      user_id: user_id ?? null,
      notification_type,
      reference_id: reference_id ?? null,
      notification_details: notification_details ?? null,
      send_by: send_by ?? null,
      scheduled_at: null,
    });

    // Send via firebase if token provided
    let sendResult = null;
    if (user_fcm_token) {
      try {
        sendResult = await this.firebaseService.sendToToken(
          user_fcm_token,
          title,
          body,
          {
            notification_type,
            notification_id: String(record.id),
          },
        );
      } catch (err) {
        this.logger.error('Failed to send firebase push', err as any);
      }
    }

    return { record, sendResult };
  }

  // Broadcast to many users. Accepts user_ids array (can be large — consider batching)
  async broadcastNotification(payload: {
    user_ids: number[];
    title: string;
    body: string;
    notification_type: string;
    notification_details?: Record<string, any>;
    send_by?: number;
    // Optionally an array of tokens aligned with user_ids
    tokens?: string[];
  }) {
    const {
      user_ids,
      title,
      body,
      notification_type,
      notification_details,
      send_by,
      tokens,
    } = payload;

    // Save a notification record for each user (or one record with user_ids for smaller storage)
    // Here we will create one record per user for individual read tracking.
    const toSave: any = user_ids.map((uid) =>
      this.repo.create({
        user_id: uid,
        notification_type,
        notification_details,
        send_by,
      } as any),
    );

    const saved = await this.repo.save(toSave);

    // If tokens provided, try firebase in batches of 500
    if (tokens && tokens.length) {
      const BATCH = 500;
      for (let i = 0; i < tokens.length; i += BATCH) {
        const batch = tokens.slice(i, i + BATCH);
        try {
          await this.firebaseService.sendToTokens(batch, title, body, {
            notification_type,
          });
        } catch (err) {
          this.logger.error('Broadcast firebase error', err as any);
        }
      }
    }

    return { savedCount: saved.length, savedIds: saved.map((s) => s.id) };
  }

  async listNotifications(user_id: number, page = 1, per_page = 25) {
    const [items, total] = await this.repo.findAndCount({
      where: { user_id },
      order: { created_at: 'DESC' },
      skip: (page - 1) * per_page,
      take: per_page,
    });

    return {
      items,
      meta: { total, page, per_page, pages: Math.ceil(total / per_page) },
    };
  }

  async markAsRead(notificationId: number) {
    const n = await this.repo.findOneBy({ id: notificationId });
    if (!n) return null;
    n.is_read = true;
    n.read_at = new Date();
    return this.repo.save(n);
  }

  async markAllAsReadForUser(userId: number) {
    await this.repo.update({ user_id: userId, is_read: false }, {
      is_read: true,
      read_at: new Date(),
    } as any);
    return { success: true };
  }

  // Get scheduled notifications ready to send (scheduled_at <= now and not sent)
  async getDueScheduledNotifications(limit = 100) {
    const now = new Date();
    return this.repo
      .createQueryBuilder('n')
      .where('n.scheduled_at IS NOT NULL')
      .andWhere('n.scheduled_at <= :now', { now })
      .orderBy('n.scheduled_at', 'ASC')
      .limit(limit)
      .getMany();
  }

  // Helper to update scheduled_at to null after processing (or delete)
  async markScheduledProcessed(id: number) {
    return this.repo.update({ id }, { scheduled_at: null } as any);
  }
}
