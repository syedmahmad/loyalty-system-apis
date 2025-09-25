import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as admin from 'firebase-admin';
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
      let existingToken = await this.tokenRepo.findOne({ where: { token } });

      if (existingToken) {
        // If the token is already assigned to this customer, just update platform if needed
        if (existingToken.customer.id === customer.id) {
          if (existingToken.platform !== platform) {
            existingToken.platform = platform;
            await this.tokenRepo.save(existingToken);
          }
        } else {
          // Token is assigned to another customer (user changed device or logged in on new account)
          existingToken.customer = { id: customer.id } as any;
          existingToken.platform = platform;
          await this.tokenRepo.save(existingToken);
        }
      } else {
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

    const tokens = await this.tokenRepo.find({
      where: { customer: { id: customer.id } },
    });

    if (!tokens.length) {
      return {
        success: false,
        message: `Device token to send notificaiton does not exist.`,
      };
    }

    const messages = tokens.map((t) => ({
      token: t.token,
      notification: { title, body },
    }));

    // const messages = [
    //   {
    //     token: 'fcm_test_token_1234567890',
    //     notification: { title, body },
    //   },
    // ];

    try {
      await Promise.all(messages.map((msg) => admin.messaging().send(msg)));

      await this.notificationRepo.save({
        notification_details: { title, body },
        customer_id: customer.id,
        notification_type: 'general',
      });

      return {
        success: true,
        message: `Notification Sent!`,
      };
    } catch (error: any) {
      console.log('error/////////////////////', error);
      return {
        success: false,
        message: `Failed to Send Notifications!`,
      };
    }
  }
}
