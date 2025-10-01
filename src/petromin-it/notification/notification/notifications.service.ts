import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import { DeviceToken } from 'src/petromin-it/notification/entities/device-token.entity';
import {
  RegisterToken,
  SendNotification,
} from 'src/petromin-it/notification/dto/notifications.dto';
import { Customer } from 'src/customers/entities/customer.entity';
import { Notification } from 'src/petromin-it/notification/entities/notification.entity';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(DeviceToken)
    private readonly tokenRepo: Repository<DeviceToken>,
  ) {
    // Initialize Firebase Admin only once
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
    }
  }

  /**
   * Registers or updates a device token for a customer.
   * - Ensures only one token per device per customer.
   * - If the token already exists for this customer, updates the platform if needed.
   * - If the token exists for another customer, reassigns it to the new customer (device change).
   * - Removes all previous tokens for this customer except the current one (so only the latest device is registered).
   *   This means notifications will only be sent to the latest device.
   */
  async saveDeviceToken(body: RegisterToken) {
    const { customer_id, token, platform } = body;

    const customer = await this.customerRepo.findOne({
      where: { uuid: customer_id, status: 1 },
    });

    if (!customer) {
      throw new NotFoundException(`Customer not found`);
    }

    try {
      // Check if this token already exists (could be for this or another customer)
      let existingToken = await this.tokenRepo.findOne({
        where: { token, customer: { id: customer.id } },
      });

      if (!existingToken) {
        // Create new token for this customer
        existingToken = this.tokenRepo.create({
          customer: { id: customer.id },
          token,
          platform,
        });
        await this.tokenRepo.save(existingToken);
      }

      return {
        success: true,
        message: `success`,
      };
    } catch (error: any) {
      console.log('///////error', error);
      return {
        success: false,
        message: `Sorry! Not able to register your token`,
      };
    }
  }

  async sendToUser(data: SendNotification) {
    const { customer_id, title, body } = data;

    const customer = await this.customerRepo.findOne({
      where: { uuid: customer_id, status: 1 },
    });

    if (!customer) {
      throw new NotFoundException(`Customer not found`);
    }

    // Always save the notification to the database first
    await this.notificationRepo.save({
      notification_details: { title, body },
      customer_id: customer.id,
      notification_type: 'general',
      uuid: uuidv4(),
    });

    // Now try to send to device(s) if tokens exist
    const tokens = await this.tokenRepo.find({
      where: { customer: { id: customer.id } },
    });

    if (!tokens.length) {
      // Notification is saved, but no device token to send to
      return {
        success: true,
        message: `Notification saved, but device token does not exist. It will be available in notification history.`,
      };
    }

    const messages = tokens.map((t) => ({
      token: t.token,
      notification: { title, body },
    }));

    try {
      await Promise.all(messages.map((msg) => admin.messaging().send(msg)));

      return {
        success: true,
        message: `Notification Sent!`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Notification saved, but failed to send to device(s)!`,
      };
    }
  }

  async getUserNotifications(
    customer_id: string,
    page = 1,
    offset = 10,
    language_code?: string,
  ) {
    console.log('language_code', language_code);

    const customer = await this.customerRepo.findOne({
      where: { uuid: customer_id, status: 1 },
    });

    if (!customer) {
      throw new NotFoundException(`Customer not found`);
    }

    // Fetch paginated notifications
    const [notifications, total] = await this.notificationRepo.findAndCount({
      where: { customer_id: customer.id },
      order: { created_at: 'DESC' },
      skip: (page - 1) * offset,
      take: offset,
      select: [
        'notification_type',
        'is_read',
        'notification_details',
        'created_at',
        'updated_at',
        'uuid',
      ],
    });

    // Count unread notifications
    const unread_count = await this.notificationRepo.count({
      where: { customer_id: customer.id, is_read: false },
    });

    return {
      success: true,
      message: 'Fetched notifications successfully',
      data: {
        total,
        page,
        offset,
        unread_count,
        notifications: notifications,
      },
    };
  }

  async markAsRead(customer_id: string, notification_id: string) {
    const customer = await this.customerRepo.findOne({
      where: { uuid: customer_id, status: 1 },
    });

    if (!customer) {
      throw new NotFoundException(`Customer not found`);
    }

    const notification = await this.notificationRepo.findOne({
      where: { uuid: notification_id, customer_id: customer.id },
    });

    if (!notification) {
      throw new NotFoundException(
        `Notification not found for given customer and notification_id`,
      );
    }

    notification.is_read = true;
    await this.notificationRepo.save(notification);

    return {
      success: true,
      message: 'Notification marked as read successfully',
    };
  }
}
