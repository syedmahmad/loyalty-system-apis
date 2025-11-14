import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DeviceToken } from 'src/petromin-it/notification/entities/device-token.entity';
import { RegisterToken } from 'src/petromin-it/notification/dto/notifications.dto';
import { Customer } from 'src/customers/entities/customer.entity';
import { Notification } from 'src/petromin-it/notification/entities/notification.entity';
import axios from 'axios';
import { decrypt, encrypt } from 'src/helpers/encryption';

interface CreateNotificationDto {
  customer_id?: number | null;
  notification_type: string;
  reference_id?: number | null;
  notification_details?: { title: string; body: string };
  send_by?: number | null;
  scheduled_at?: Date | null;
  user_ids?: number[] | null;
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(DeviceToken)
    private readonly tokenRepo: Repository<DeviceToken>,
  ) {}

  /**
   * Registers or updates a device token for a customer.
   * - Ensures only one token per device per customer.
   * - If the token already exists for this customer, updates the platform if needed.
   * - If the token exists for another customer, reassigns it to the new customer (device change).
   * - Removes all previous tokens for this customer except the current one (so only the latest device is registered).
   *   This means notifications will only be sent to the latest device.

   * Save or update a device token for a customer.
   * - Prevents duplicate entries for the same token and customer.
   * - If a token exists for a different customer, reassigns to the new customer, ensuring a device is only linked to one customer.
   * - If customer logs in from a different device (different token), both devices get valid records.
   * - If a repeated API call tries to insert duplicate for same token/customer, it does not create a duplicate.
   * - If API is hit truly twice in high concurrency, still duplicates should be prevented by checking again within a transaction.
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
      // Check if this device token already exists in DB
      const existingToken = await this.tokenRepo.findOne({
        where: { token },
        relations: ['customer'],
      });

      if (existingToken) {
        // If token is already associated with this customer, just update platform if needed
        if (
          existingToken.customer &&
          existingToken.customer.id === customer.id
        ) {
          if (existingToken.platform !== platform) {
            existingToken.platform = platform;
            await this.tokenRepo.save(existingToken);
          }
        } else {
          // Token exists but assigned to a different customer - reassign it to this one!
          existingToken.customer = customer;
          existingToken.platform = platform;
          await this.tokenRepo.save(existingToken);
        }
      } else {
        // Token doesn't exist - create new for this customer/device
        await this.tokenRepo.save(
          this.tokenRepo.create({
            customer,
            token,
            platform,
          }),
        );
      }

      // NOTE: Do NOT remove other tokens of this customer.
      // We now allow each customer to have multiple device tokens (multi-device notification support).

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

  async sendToUser(
    payload: any,
    saveNotificationPayload: {
      title: string;
      body: string;
      customer_id: number;
    },
  ) {
    // const { customer_id, title, body } = data;
    // const customer = await this.customerRepo.findOne({
    //   where: { uuid: customer_id, status: 1 },
    // });
    // if (!customer) {
    //   throw new NotFoundException(`Customer not found`);
    // }
    // // Always save the notification to the database first
    await this.notificationRepo.save({
      notification_details: {
        title: saveNotificationPayload.title,
        body: saveNotificationPayload.body,
      },
      customer_id: saveNotificationPayload.customer_id,
      notification_type: 'general',
      uuid: uuidv4(),
    });
    // // Now try to send to device(s) if tokens exist
    // const tokens = await this.tokenRepo.find({
    //   where: { customer: { id: customer.id } },
    // });
    // if (!tokens.length) {
    //   // Notification is saved, but no device token to send to
    //   return {
    //     success: true,
    //     message: `Notification saved, but device token does not exist. It will be available in notification history.`,
    //   };
    // }
    // const messages = tokens.map((t) => ({
    //   token: t.token,
    //   notification: { title, body },
    // }));
    // try {
    //   await Promise.all(messages.map((msg) => admin.messaging().send(msg)));
    //   return {
    //     success: true,
    //     message: `Notification Sent!`,
    //   };
    // } catch (error: any) {
    //   return {
    //     success: false,
    //     message: `Notification saved, but failed to send to device(s)!`,
    //   };
    // }

    try {
      // Send notification request
      await axios.post(
        process.env.NCMC_COMMUNICATION_NOTIFICATION_ENDPOINT,
        payload,
        {
          headers: {
            Authorization: `Bearer ${process.env.NCMC_COMMUNICATION_TOKEN}`,
            'Content-Type': 'application/json',
          },
        },
      );

      console.log('Notification sent successfully');
    } catch (err) {
      console.error(
        'Error while sending notification:',
        err.response?.data || err.message,
      );
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

  /**
   * Add a new notification record.
   */
  async addNotification(data: CreateNotificationDto): Promise<Notification> {
    try {
      const notification = this.notificationRepo.create({
        customer_id: data.customer_id ?? null,
        notification_type: data.notification_type,
        reference_id: data.reference_id ?? null,
        is_read: false,
        read_at: null,
        notification_details: data.notification_details ?? null,
        send_by: data.send_by ?? null,
        scheduled_at: data.scheduled_at ?? null,
        user_ids: data.user_ids ?? null,
      });

      return await this.notificationRepo.save(notification);
    } catch (error) {
      console.error('❌ Failed to create notification:', error);
      throw new Error('Failed to create notification');
    }
  }

  async getAllDeviceTokens(
    mobileNumbers: string[],
  ): Promise<Record<string, string[]>> {
    if (!mobileNumbers?.length) {
      return {};
    }

    // 1️⃣ Fetch customers whose hashed_number matches the given mobile numbers
    const customers = await this.customerRepo.find({
      where: mobileNumbers.map((num) => ({ hashed_number: encrypt(num) })),
      select: ['id', 'hashed_number'],
    });

    if (!customers.length) {
      return {};
    }

    // Map hashed_number -> customerId
    const customerIdMap: Record<string, number> = {};
    customers.forEach((c) => {
      customerIdMap[c.hashed_number] = c.id;
    });

    const customerIds = customers.map((c) => c.id);

    // 2️⃣ Fetch device tokens for these customers
    const deviceTokens = await this.tokenRepo.find({
      where: { customer: { id: In(customerIds) } },
      relations: ['customer'],
      select: ['token', 'customer'],
    });

    // 3️⃣ Map mobile numbers to device tokens
    const result: Record<string, string[]> = {};

    deviceTokens.forEach((dt) => {
      const mobile = decrypt(dt.customer.hashed_number);
      if (!result[mobile]) {
        result[mobile] = [];
      }
      result[mobile].push(dt.token);
    });

    // 4️⃣ Return key-value object
    return result;
  }
}
