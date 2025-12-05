/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as dayjs from 'dayjs';
import { Request } from 'express';
import { nanoid } from 'nanoid';
import * as QRCode from 'qrcode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { CampaignCoupons } from 'src/campaigns/entities/campaign-coupon.entity';
import { CampaignCustomerSegment } from 'src/campaigns/entities/campaign-customer-segments.entity';
import { CampaignRule } from 'src/campaigns/entities/campaign-rule.entity';
import { Campaign } from 'src/campaigns/entities/campaign.entity';
import { CouponTypeService } from 'src/coupon_type/coupon_type/coupon_type.service';
import { Coupon } from 'src/coupons/entities/coupon.entity';
import { CustomerSegmentMember } from 'src/customer-segment/entities/customer-segment-member.entity';
import { EarnWithEvent } from 'src/customers/dto/earn-with-event.dto';
import { OciService } from 'src/oci/oci.service';
import { Rule } from 'src/rules/entities/rules.entity';
import { TiersService } from 'src/tiers/tiers/tiers.service';
import {
  CouponStatus,
  UserCoupon,
} from 'src/wallet/entities/user-coupon.entity';
import { WalletOrder } from 'src/wallet/entities/wallet-order.entity';
import { WalletSettings } from 'src/wallet/entities/wallet-settings.entity';
import {
  WalletTransaction,
  WalletTransactionStatus,
  WalletTransactionType,
} from 'src/wallet/entities/wallet-transaction.entity';
import { CreateCustomerActivityDto } from './dto/create-customer-activity.dto';
import { CustomerEarnDto } from './dto/customer-earn.dto';
import { BurnWithEvent } from './dto/burn-with-event.dto';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { WalletService } from 'src/wallet/wallet/wallet.service';
import {
  In,
  IsNull,
  LessThanOrEqual,
  Like,
  MoreThanOrEqual,
  Not,
  Repository,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { QrCode } from '../qr_codes/entities/qr_code.entity';
import { QrcodesService } from '../qr_codes/qr_codes/qr_codes.service';
import { BulkCreateCustomerDto } from './dto/create-customer.dto';
import { CustomerActivity } from './entities/customer-activity.entity';
import { Customer } from './entities/customer.entity';
import { GvrEarnBurnWithEventsDto } from 'src/customers/dto/gvr_earn_burn_with_event.dto';
import { Tier } from 'src/tiers/entities/tier.entity';
import { isValidUrl } from 'src/helpers/helper';
import { CustomerDto } from './dto/customer.dto';
import { NotificationService } from 'src/petromin-it/notification/notification/notifications.service';
import { CustomerPreference } from 'src/petromin-it/preferences/entities/customer-preference.entity';
import { OpenAIService } from 'src/openai/openai/openai.service';
import { BUSINESS_UNITS_WITH_UUID } from './type/type';
import axios from 'axios';
import { DeviceToken } from 'src/petromin-it/notification/entities/device-token.entity';
import { decrypt } from 'src/helpers/encryption';

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    private readonly notificationService: NotificationService,
    private readonly walletService: WalletService,
    private readonly ociService: OciService,
    @InjectRepository(QrCode)
    private readonly qrCodeRepo: Repository<QrCode>,
    private readonly qrService: QrcodesService,
    private readonly tiersService: TiersService,
    private readonly openaiService: OpenAIService,
    @InjectRepository(Rule)
    private readonly ruleRepo: Repository<Rule>,
    @InjectRepository(WalletTransaction)
    private txRepo: Repository<WalletTransaction>,
    @InjectRepository(Wallet)
    private walletRepo: Repository<Wallet>,
    @InjectRepository(WalletOrder)
    private WalletOrderrepo: Repository<WalletOrder>,
    @InjectRepository(WalletSettings)
    private walletSettingsRepo: Repository<WalletSettings>,
    @InjectRepository(CampaignCustomerSegment)
    private readonly campaignCustomerSegmentRepo: Repository<CampaignCustomerSegment>,
    @InjectRepository(CampaignRule)
    private readonly campaignRuleRepo: Repository<CampaignRule>,
    @InjectRepository(CustomerActivity)
    private readonly customeractivityRepo: Repository<CustomerActivity>,
    @InjectRepository(CampaignCoupons)
    private readonly campaignCouponRepo: Repository<CampaignCoupons>,
    private readonly couponTypeService: CouponTypeService,
    @InjectRepository(CustomerSegmentMember)
    private readonly customerSegmentMemberRepository: Repository<CustomerSegmentMember>,
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(Coupon)
    private readonly couponRepo: Repository<Coupon>,
    @InjectRepository(DeviceToken)
    private readonly deviceTokenRepo: Repository<DeviceToken>,

    @InjectRepository(UserCoupon)
    private userCouponRepo: Repository<UserCoupon>,

    @InjectRepository(Tier)
    private tierRepo: Repository<Tier>,

    @InjectRepository(CustomerPreference)
    private readonly customerPreferencesRepo: Repository<CustomerPreference>,
  ) {}

  /**
   * Creates one or more customers in bulk.
   * - For each customer in the input DTO:
   *   - Validates that a phone number is provided.
   *   - Checks if a customer with the same external_customer_id and business unit already exists.
   *     - If exists:
   *       - Ensures the customer has a UUID and tenant set, updating if necessary.
   *       - Ensures a QR code exists for the customer, creating one if not.
   *       - Returns the QR code URL and status 'exists'.
   *     - If not exists:
   *       - Encrypts the email and phone fields.
   *       - Creates a new customer entity with encrypted data, business unit, tenant, and a new UUID.
   *       - Saves the new customer to the database.
   *       - Creates and saves a QR code for the new customer.
   *       - Creates a wallet for the new customer.
   *       - Returns the QR code URL and status 'created'.
   * - Returns an array of results for each customer processed.
   *
   * @param req - The request object, expected to have businessUnit and tenant attached.
   * @param dto - BulkCreateCustomerDto containing an array of customers to create.
   * @returns Array of result objects for each customer processed.
   */
  async createCustomer(req: Request, dto: BulkCreateCustomerDto) {
    const businessUnit = (req as any).businessUnit;
    const tenant = (req as any).tenant;

    // Validate that a business unit is present in the request
    if (!businessUnit) {
      throw new BadRequestException('Invalid Business Unit Key');
    }

    // Generate a UUID to use for new customers
    const customerUuid = uuidv4();

    const results = [];
    for (const customerDto of dto.customers) {
      // Ensure phone number is provided
      if (!customerDto.phone) {
        results.push({
          status: 'failed',
          message: 'Phone number is required',
        });
        continue;
      }

      // Check if customer already exists by external_customer_id and business unit
      const existing = await this.customerRepo.findOne({
        where: {
          status: 1,
          external_customer_id: customerDto.external_customer_id,
          business_unit: { id: businessUnit.id },
        },
        relations: ['business_unit'],
      });

      if (existing) {
        // If existing customer is missing uuid or tenant, set them
        if (!existing.uuid || !existing.tenant) {
          existing.uuid ??= customerUuid;
          existing.tenant ??= tenant;
          await this.customerRepo.save(existing);
        }

        // Check if a QR code exists for this customer, create if not
        let existCustomerQr = await this.qrService.findOne(existing.id);
        if (!existCustomerQr || !isValidUrl(existCustomerQr.qr_code_url)) {
          existCustomerQr = await this.createAndSaveCustomerQrCode(
            customerUuid,
            existing.id,
          );
        }

        const responseObj = {
          status: 'exists',
          qr_code_url: `/qrcodes/qr/${existCustomerQr.short_id}`,
        };
        if (BUSINESS_UNITS_WITH_UUID.includes(existing.business_unit.id)) {
          responseObj['uuid'] = existing.uuid;
        }

        // Return status 'exists' and QR code URL
        results.push(responseObj);
        continue;
      }

      // Encrypt email and phone before saving
      const encryptedEmail = await this.ociService.encryptData(
        customerDto.email,
      );
      const encryptedPhone = await this.ociService.encryptData(
        customerDto.phone,
      );

      // Create new customer entity
      const customer = this.customerRepo.create({
        ...customerDto,
        email: encryptedEmail,
        phone: encryptedPhone,
        DOB: new Date(customerDto.DOB),
        business_unit: businessUnit,
        tenant: tenant,
        uuid: customerUuid,
      });
      const saved = await this.customerRepo.save(customer);

      // Create and save QR code for the new customer
      const saveCustomerQrCodeInfo = await this.createAndSaveCustomerQrCode(
        customerUuid,
        saved.id,
      );
      // TODO: need to check existing wallet for customer, his point balance.
      // how to do that,
      // create a new transaction for customer wallet and add reason of adjustment like import form external system
      // and then add points to customer wallet

      // Create a wallet for the new customer
      await this.walletService.createWallet({
        customer_id: saved.id,
        business_unit_id: businessUnit.id,
        tenant_id: tenant.id,
      });

      const responseObj = {
        status: 'created',
        qr_code_url: `/qrcodes/qr/${saveCustomerQrCodeInfo.short_id}`,
      };

      if (BUSINESS_UNITS_WITH_UUID.includes(saved.business_unit.id)) {
        responseObj['uuid'] = saved.uuid;
      }

      // Return status 'created' and QR code URL
      results.push(responseObj);
    }

    // Return results for all processed customers
    return results;
  }

  async getCustomerById(id: number) {
    const customer = await this.customerRepo.findOne({
      where: { id, status: 1 },
    });

    if (!customer) {
      throw new Error(`Customer with ID ${id} not found`);
    }

    return customer;
  }

  async getAllCustomers(
    client_id: number,
    page: number = 1,
    pageSize: number = 20,
    permission: any,
    search?: string,
  ) {
    if (!permission.canViewCustomers) {
      throw new BadRequestException(
        "You don't have permission to access customers",
      );
    }
    const take = pageSize;
    const skip = (page - 1) * take;

    const [data, total] = await this.customerRepo.findAndCount({
      relations: ['business_unit', 'tenant'],
      where: {
        tenant: { id: client_id },
        ...(search ? { name: Like(`%${search}%`) } : {}),
      },
      take,
      skip,
      order: { created_at: 'DESC' },
    });

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async updateStatus(id: number, status: 0 | 1) {
    const customer = await this.customerRepo.findOne({
      where: { id },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    customer.status = status;
    return this.customerRepo.save(customer);
  }

  async getCustomerByUuid(req: Request, uuid: string) {
    const businessUnit = (req as any).businessUnit;

    if (!businessUnit) {
      throw new BadRequestException('Invalid Business Unit Key');
    }

    const customer = await this.customerRepo.findOne({
      where: { uuid: uuid, status: 1 },
    });

    if (!customer) {
      throw new NotFoundException(`Customer not found`);
    }

    const walletinfo = await this.walletService.getSingleCustomerWalletInfo(
      customer.id,
      businessUnit.id,
    );
    const transactionInfo = await this.walletService.getWalletTransactions(
      walletinfo?.id,
    );
    return {
      total_balance: walletinfo?.total_balance,
      available_balance: walletinfo?.available_balance,
      locked_balance: walletinfo?.locked_balance,
      customer_name: customer.name,
      city: customer.city,
      address: customer.address,
      businessUnit: walletinfo?.business_unit?.name,
      tenant_id: walletinfo?.business_unit?.tenant_id,
      transactions: transactionInfo || [],
    };
  }

  /**
   * Creates a QR code for a customer and saves the mapping in the database.
   * @param customerUuid - The UUID of the customer to encode in the QR code.
   * @param customerId - The database ID of the customer for mapping.
   * @returns The saved QR code mapping entity.
   */
  async createAndSaveCustomerQrCode(customerUuid, customerId) {
    const shortId = nanoid(8);
    const tempDir = os.tmpdir();
    const fileName = `${customerUuid}.png`;
    const tempFilePath = path.join(tempDir, fileName);

    try {
      // Generate QR code to temp file
      await QRCode.toFile(tempFilePath, customerUuid);

      // Convert file stream to buffer
      const fileStreamBuffer = fs.createReadStream(tempFilePath);
      const buffer = await this.streamToBuffer(fileStreamBuffer);

      // Upload to OCI
      const uploadedData = await this.ociService.uploadBufferToOci(
        buffer,
        'dragon',
        fileName,
      );

      const checkExistCustomerInQR = await this.qrCodeRepo.findOne({
        where: {
          customer: { id: customerId },
        },
      });

      if (checkExistCustomerInQR) {
        checkExistCustomerInQR.qr_code_url = uploadedData
          ? `${process.env.OCI_URL}/${fileName}`
          : null;
        return await this.qrCodeRepo.save(checkExistCustomerInQR);
      }

      // Save mapping in DB
      const mapping = this.qrCodeRepo.create({
        customer: { id: customerId },
        short_id: shortId,
        qr_code_url: uploadedData ? `${process.env.OCI_URL}/${fileName}` : null,
      });

      // Save the mapping entity to the database and return the result
      return await this.qrCodeRepo.save(mapping);
    } catch (error) {
      console.error('Error creating and saving customer QR code:', error);
      throw new Error('Failed to create and save customer QR code');
    } finally {
      // Always clean up temp file
      fs.unlink(tempFilePath, (err) => {
        if (err) {
          console.warn('Failed to delete temp QR file:', err);
        } else {
          console.log('Temp QR file deleted:', tempFilePath);
        }
      });
    }
  }

  streamToBuffer(stream: fs.ReadStream): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) =>
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
      );
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async getCustomerWithWalletAndTransactions(
    req: Request,
    customerId: number,
    pointPage: number = 1,
    couponPage: number = 1,
    pageSize: number,
    pointQuery: string,
    couponQuery: string,
  ) {
    const customer = await this.customerRepo.findOne({
      where: { id: customerId, status: 1 },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with id ${customerId} not found`);
    }

    const walletinfo = await this.walletService.getSingleCustomerWalletInfoById(
      customer?.id,
    );

    if (!walletinfo) {
      throw new NotFoundException(`Customer Wallet is not configured.`);
    }

    const transactionInfo = await this.walletService.getWalletTransactions(
      walletinfo?.id,
      pointPage,
      pageSize,
      pointQuery,
      'points',
    );

    const couponTransactionInfo =
      await this.walletService.getWalletTransactions(
        walletinfo?.id,
        couponPage,
        pageSize,
        couponQuery,
        'coupon',
      );

    const tiersInfo =
      await this.tiersService.getCurrentCustomerTier(customerId);

    return {
      ...customer,
      wallet: walletinfo,
      transactions: transactionInfo,
      couponTransactionInfo: couponTransactionInfo,
      tier: tiersInfo,
    };
  }

  async createCustomerActivity(body: CreateCustomerActivityDto) {
    const customer = await this.customerRepo.findOne({
      where: { uuid: body.customer_uuid, status: 1 },
    });

    if (!customer) {
      throw new NotFoundException(`Customer not found`);
    }

    const customerActivity = this.customeractivityRepo.create({
      ...body,
    });

    return this.customeractivityRepo.save(customerActivity);
  }

  async earnPoints(bodyPayload: CustomerEarnDto, langCode = 'en') {
    const { customer_id, campaign_type, campaign_id } = bodyPayload;

    // Step 1: Get Customer & Wallet Info
    const customer = await this.customerRepo.findOne({
      where: { uuid: customer_id, status: 1 },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    if (customer && customer.status === 0) {
      throw new NotFoundException('Customer is inactive');
    }

    const wallet = await this.walletService.getSingleCustomerWalletInfoById(
      customer.id,
    );
    if (!wallet) throw new NotFoundException('Wallet not found');

    if (campaign_id && !campaign_type) {
      throw new BadRequestException('campaign_type is missing');
    }

    // Step 2: handling CampaignRuleEarning, SimpleRuleEarning and CampaignCouponEarning
    return this.handleCampaignEarning({
      ...bodyPayload,
      wallet,
      langCode: langCode,
    });
  }

  async earnWithEvent(bodyPayload: EarnWithEvent, langCode = 'en') {
    const { customer_id, event, BUId, metadata, tenantId } = bodyPayload;

    // 1. Find customer by uuid
    const customer = await this.customerRepo.findOne({
      where: {
        uuid: customer_id,
        business_unit: { id: parseInt(BUId) },
        status: 1,
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    // 2. Find earning rule by event name (case-insensitive)
    let rule;
    if (event) {
      const query = this.ruleRepo
        .createQueryBuilder('rule')
        .leftJoinAndSelect('rule.locales', 'locale')
        .leftJoinAndSelect('locale.language', 'language')
        .where('rule.status = :status', { status: 1 })
        .andWhere('rule.rule_type != :ruleType', { ruleType: 'burn' })
        .andWhere('locale.name = :event', { event });

      if (langCode) {
        query.andWhere('language.code = :langCode', { langCode });
      }

      const rule = await query.getOne();

      if (rule.reward_points === 0) {
        throw new BadRequestException(
          `There is no rewards points to aginst this ${rule?.locales?.[0]?.name}`,
        );
      }
      if (!rule)
        throw new NotFoundException('Earning rule not found for this event');
    } else {
      const rules = await this.ruleRepo.find({
        where: {
          status: 1,
          // shoudl add tenant..
          rule_type: Not('burn'),
          tenant_id: Number(tenantId),
          dynamic_conditions: Not(IsNull()),
        },
      });
      /*
        rule.dynamic_conditions: [{"condition_type":"store_id","condition_operator":"==","condition_value":"NCMC001"},
        {"condition_type":"name","condition_operator":"==","condition_value":"gasoline"},
        {"condition_type":"quantity","condition_operator":"==","condition_value":"3.5 litter"},
        {"condition_type":"amount","condition_operator":"==","condition_value":"10"}]

        "metadata": {
          "store_id": "NCMC_station_002"
          "name": "High Octance",
          "quantity": "5 Litter",
          "amount": 10
        }
      */
      const matchingRules = rules.filter((rule) =>
        this.validateRuleAgainstMetadata(rule, metadata),
      );

      if (!matchingRules.length) {
        throw new NotFoundException(`Earning rule not found for this station`);
      }

      if (matchingRules.length == 1) {
        rule = matchingRules[0];
      } else {
        rule = matchingRules
          .filter((singleRule) => singleRule.is_priority === 1)
          .reduce(
            (latest, current) =>
              !latest ||
              new Date(current.created_at) > new Date(latest.created_at)
                ? current
                : latest,
            null,
          );
        if (!rule) {
          // Find the one with the latest created_at
          rule = matchingRules.reduce((latest, current) => {
            return new Date(current.created_at) > new Date(latest.created_at)
              ? current
              : latest;
          }, matchingRules[0]);
        }
      }
    }
    // 3. Get customer wallet info
    const wallet = await this.walletService.getSingleCustomerWalletInfoById(
      customer.id,
    );
    if (!wallet) throw new NotFoundException('Wallet not found');

    // 4. Check frequency and if user already got this reward
    // const alreadyRewarded = false;
    // Find previous wallet transaction for this event, customer, and business_unit
    const txWhere: any = {
      wallet: { id: wallet.id },
      business_unit: { id: parseInt(BUId) },
      type: 'earn',
      source_type: event,
    };
    // if (walletOrderId) txWhere.wallet_order_id = walletOrderId;

    const previousTx = await this.txRepo.findOne({
      where: txWhere,
      order: { created_at: 'DESC' },
    });

    // Frequency logic
    if (rule.frequency === 'once' && previousTx) {
      throw new BadRequestException(
        'Reward for this event already granted (once per customer)',
      );
    }
    if (rule.frequency === 'daily' && previousTx) {
      // Check if already rewarded today
      const today = dayjs().startOf('day');
      const txDate = dayjs(previousTx.created_at).startOf('day');
      if (txDate.isSame(today)) {
        throw new BadRequestException(
          'Reward for this event already granted today',
        );
      }
    }
    if (rule.frequency === 'yearly' && previousTx) {
      // Check if already rewarded this year
      const thisYear = dayjs().year();
      const txYear = dayjs(previousTx.created_at).year();
      if (txYear === thisYear) {
        throw new BadRequestException(
          'Reward for this event already granted this year',
        );
      }
    }
    // 'anytime' means no restriction
    // 5. Calculate reward points
    let rewardPoints = rule.reward_points;
    // TODO: BIG NOTE:
    const Orderamount = metadata?.amount ? Number(metadata.amount) : undefined;

    // I think, we will add this || rule.rule_type === 'dynamic'
    if (['spend and earn', 'dynamic rule'].includes(rule.rule_type)) {
      if (!Orderamount) {
        throw new BadRequestException(
          'Amount is required for spend and earn rule',
        );
      }
      // in this case give rewards in the multple of what user spends.
      if (rule.reward_condition === 'perAmount') {
        if (Orderamount < rule.min_amount_spent) {
          throw new BadRequestException(
            `Minimum amount to earn points is ${rule.min_amount_spent}`,
          );
        }
        // Points per amount spent
        const multiplier = Math.floor(Orderamount / rule.min_amount_spent);
        rewardPoints = multiplier * rewardPoints;
      } else if (
        rule.reward_condition === 'minimum' ||
        rule.reward_condition === null
      ) {
        if (Orderamount < rule.min_amount_spent) {
          throw new BadRequestException(
            `Minimum amount to earn points is ${rule.min_amount_spent}`,
          );
        }
        // Give fixed reward points, I think, don't need to assign it again.
        // rewardPoints = rule.reward_points;
      }
    }

    if (!rewardPoints || rewardPoints <= 0) {
      throw new BadRequestException('No reward points to grant');
    }

    const walletSettings = await this.walletSettingsRepo.findOne({
      where: { business_unit: { id: parseInt(BUId) } },
    });

    // 6. Check business unit's pending_method
    const pendingMethod = walletSettings?.pending_method || 'none';
    const pendingDays = walletSettings?.pending_days || 0;
    // Via the cron job to unlcok these locked balance on each midnight.

    // 7. Update wallet balances because it is priority
    if (pendingMethod === 'none') {
      // Immediately add to available_balance and total_balance
      wallet.available_balance += rewardPoints;
      wallet.total_balance += rewardPoints;
      await this.walletService.updateWalletBalances(wallet.id, {
        available_balance: wallet.available_balance,
        total_balance: wallet.total_balance,
      });
    } else if (pendingMethod === 'fixed_days') {
      // Add to locked_balance and total_balance, available_balance unchanged
      wallet.locked_balance += rewardPoints;
      wallet.total_balance += rewardPoints;
      await this.walletService.updateWalletBalances(wallet.id, {
        locked_balance: wallet.locked_balance,
        total_balance: wallet.total_balance,
      });
      // Cron job will unlock after pending_days
    }

    // 8. Now, we need to generate wallet_order if any
    // const walletOrderId: number | null = null;
    // Try to map metadata to wallet_order if possible (optional, depends on event)
    // For event-based, wallet_order may not exist, so we keep it null
    let walletOrderRes;
    if (metadata) {
      // Check if metadata is present, is an object, and contains 'amount'
      if (
        metadata &&
        typeof metadata === 'object' &&
        metadata.amount !== undefined
      ) {
        // You can access metadata.amount here if needed
        // For example, you might want to log or process the amount
        // Add any additional logic here as required

        const walletOrder: Partial<WalletOrder> = {
          wallet: wallet, // pass the full Wallet entity instance
          // wallet_order_id: walletOrderId,
          business_unit: wallet.business_unit, // pass the full BusinessUnit entity instance
          amount: metadata.amount,
          metadata,
          discount: 0,
          subtotal: metadata.amount,
        };

        // Save order or metatDataInfo
        walletOrderRes = await this.WalletOrderrepo.save(walletOrder);
      }
    }

    // 9. Create wallet_transaction
    const walletTransaction: Partial<WalletTransaction> = {
      wallet: wallet, // pass the full Wallet entity instance
      orders: walletOrderRes,
      customer: customer,
      uuid: uuidv4(),
      // wallet_order_id: walletOrderId,
      business_unit: wallet.business_unit, // pass the full BusinessUnit entity instance
      type: WalletTransactionType.EARN,
      source_type: event,
      created_at: dayjs().toDate(),
      updated_at: dayjs().toDate(),
      amount: Orderamount || 0,
      status:
        pendingDays > 0
          ? WalletTransactionStatus.PENDING
          : WalletTransactionStatus.ACTIVE,
      description: `Earned ${rewardPoints} points ${event}`,
      // Set the unlock_date for the wallet transaction.
      // If there are pendingDays (i.e., points are locked for a period), set unlock_date to the date after pendingDays.
      // Otherwise, set unlock_date to null (no unlock needed).
      unlock_date:
        pendingDays > 0 ? dayjs().add(pendingDays, 'day').toDate() : null,

      prev_available_points: wallet.available_balance,

      point_balance: rewardPoints, //wallet.available_balance,

      // Set the expiry_date for the wallet transaction.
      // If the rule has a validity_after_assignment value:
      //   - If there are pendingDays (i.e., points are locked for a period), expiry is after (pendingDays + validity_after_assignment) days.
      //   - If there are no pendingDays, expiry is after validity_after_assignment days.
      // If the rule does not have validity_after_assignment, expiry_date is null (no expiry).
      expiry_date: rule.validity_after_assignment
        ? pendingDays > 0
          ? dayjs()
              .add(pendingDays + rule.validity_after_assignment, 'day')
              .toDate()
          : dayjs().add(rule.validity_after_assignment, 'day').toDate()
        : dayjs()
            .add(parseInt(walletSettings.expiration_value), 'day')
            .toDate(),
    };
    // Save transaction
    const savedTx = await this.txRepo.save(walletTransaction);

    const customerPreferences = await this.customerPreferencesRepo.findOne({
      where: {
        customer: { id: customer.id },
      },
    });

    if (customerPreferences.push_notification) {
      // There could be duplicate entries or multiple, so fetch the last one (most recently created)
      const deviceTokens = await this.deviceTokenRepo.find({
        where: { customer: { id: customer.id } },
        order: { createdAt: 'DESC' },
      });

      const templateId = process.env.EARNED_POINTS_TEMPLATE_ID;

      const tokensString = deviceTokens.map((t) => t.token).join(',');

      try {
        // Prepare data payload
        const payload = {
          template_id: templateId,
          language_code: 'en', // or 'ar'
          business_name: 'PETROMINit',
          to: [
            {
              user_device_token: tokensString,
              customer_mobile: decrypt(customer.hashed_number),
              dynamic_fields: {
                rewardPoints: rewardPoints.toString(),
                event: event,
              },
            },
          ],
        };

        const saveNotificationPayload = {
          title: 'Points Earned',
          body: `Earned ${rewardPoints} points against this event: ${event}`,
          customer_id: customer.id,
        };

        // Send notification request
        await this.notificationService.sendToUser(
          payload,
          saveNotificationPayload,
        );

        console.log('Notification sent successfully');
      } catch (err) {
        console.error(
          'Error while sending notification:',
          err.response?.data || err.message,
        );
      }
    }

    return {
      message: 'Points earned successfully',
      points: rewardPoints,
      status: walletTransaction.status,
      transaction_id: savedTx.id,
      available_balance: wallet.available_balance,
      locked_balance: wallet.locked_balance,
      total_balance: wallet.total_balance,
    };
  }

  async burnWithEvent(bodyPayload: BurnWithEvent, langCode = 'en') {
    const { customer_id, metadata, event, tenantId } = bodyPayload;

    if (!metadata.amount) {
      throw new BadRequestException('Amount is required in metadata');
    }

    const total_amount = Number(metadata.amount);

    const customerInfo = await this.customerRepo.find({
      where: { uuid: customer_id, status: 1 },
      relations: ['business_unit'],
    });

    const wallet = await this.walletRepo.findOne({
      where: { customer: { uuid: customer_id } },
      relations: ['business_unit'],
    });

    const customer = customerInfo[0];
    if (!customer) throw new NotFoundException('Customer not found');

    let rule;
    if (event) {
      const query = this.ruleRepo
        .createQueryBuilder('rule')
        .leftJoinAndSelect('rule.locales', 'locale')
        .leftJoinAndSelect('locale.language', 'language')
        .where('rule.status = :status', { status: 1 })
        .andWhere('rule.rule_type = :ruleType', { ruleType: 'burn' })
        .andWhere('locale.name = :event', { event });

      if (langCode) {
        query.andWhere('language.code = :langCode', { langCode });
      }
      rule = await query.getOne();

      if (!rule)
        throw new NotFoundException('Burn rule not found for this campaign');
    } else {
      const rules = await this.ruleRepo.find({
        where: {
          status: 1,
          tenant_id: Number(tenantId),
          rule_type: 'burn',
          dynamic_conditions: Not(IsNull()),
        },
      });
      const matchingRules = rules.filter((rule) =>
        this.validateRuleAgainstMetadata(rule, metadata),
      );
      if (!matchingRules.length) {
        throw new NotFoundException('Earning rule not found for this metadata');
      }
      if (matchingRules.length == 1) {
        rule = matchingRules[0];
      } else {
        rule = matchingRules
          .filter((singleRule) => singleRule.is_priority === 1)
          .reduce(
            (latest, current) =>
              !latest ||
              new Date(current.created_at) > new Date(latest.created_at)
                ? current
                : latest,
            null,
          );
        if (!rule) {
          // Find the one with the latest created_at
          rule = matchingRules.reduce((latest, current) => {
            return new Date(current.created_at) > new Date(latest.created_at)
              ? current
              : latest;
          }, matchingRules[0]);
        }
      }
    }

    // Step 5: Validate rule conditions
    if (total_amount < rule.min_amount_spent) {
      throw new BadRequestException(
        `Minimum amount to burn is ${rule.min_amount_spent}`,
      );
    }

    if (wallet.available_balance < rule.max_redeemption_points_limit) {
      throw new BadRequestException(
        `You don't have enough loyalty points, ${rule.max_redeemption_points_limit} loyalty point are required for this campaign and you've ${wallet.available_balance} loyalty points`,
      );
    }

    // Step 6: Determine applicable conversion rate
    const conversionRate = rule.points_conversion_factor;

    // Step 7: Calculate points and discount
    let discountAmount = 0;
    let pointsToBurn = 0;

    if (rule.burn_type === 'FIXED') {
      pointsToBurn = rule.max_redeemption_points_limit;
      discountAmount = pointsToBurn * conversionRate;

      if (discountAmount > total_amount) {
        discountAmount = total_amount;
        pointsToBurn = total_amount / conversionRate;
      }
    } else if (rule.burn_type === 'PERCENTAGE') {
      discountAmount = (total_amount * rule.max_burn_percent_on_invoice) / 100;
      pointsToBurn = rule.max_redeemption_points_limit;
    } else {
      throw new BadRequestException('Invalid burn type in rule');
    }

    // if (discountAmount > total_amount) {
    // throw new BadRequestException(
    //   'Cannot gave discount because invoice amount is smaller than the discount amount',
    // );
    // }
    // Step 8: Create burn transaction
    // Import WalletTransactionType at the top if not already imported:
    // import { WalletTransactionType } from 'src/wallet/entities/wallet-transaction.entity';
    const burnPayload = {
      customer_id: customer.id,
      business_unit_id: customer.business_unit.id,
      wallet_id: wallet.id,
      type: WalletTransactionType.BURN,
      amount: discountAmount,
      status: WalletTransactionStatus.ACTIVE,
      source_type: rule.name,
      source_id: rule.id,
      description: `Burned ${pointsToBurn} points for discount of ${discountAmount} on amount ${total_amount}`,
    };

    // 8. Now, we need to generate wallet_order if any
    // const walletOrderId: number | null = null;
    // Try to map metadata to wallet_order if possible (optional, depends on event)
    // For event-based, wallet_order may not exist, so we keep it null
    let walletOrderRes;
    if (metadata) {
      // Check if metadata is present, is an object, and contains 'amount'
      if (
        metadata &&
        typeof metadata === 'object' &&
        metadata.amount !== undefined
      ) {
        // You can access metadata.amount here if needed
        // For example, you might want to log or process the amount
        // Add any additional logic here as required

        const walletOrder: Partial<WalletOrder> = {
          wallet: wallet, // pass the full Wallet entity instance
          // wallet_order_id: walletOrderId,
          business_unit: wallet.business_unit, // pass the full BusinessUnit entity instance
          amount: metadata.amount,
          metadata,
          discount: discountAmount,
          subtotal: metadata.amount - discountAmount,
        };

        // Save order or metatDataInfo
        walletOrderRes = await this.WalletOrderrepo.save(walletOrder);
      }
    }

    // Step 9: Create burn transaction in wallet

    const tx = await this.walletService.addTransaction(
      {
        ...burnPayload,
        wallet_order_id: walletOrderRes?.id,
        wallet_id: wallet?.id,
        business_unit_id: customer?.business_unit?.id,
        prev_available_points: wallet.available_balance,
        points_balance: pointsToBurn,
      },
      customer?.id,
      true,
    );

    const walletInfo = await this.walletRepo.findOne({
      where: { id: wallet.id },
      relations: ['business_unit'],
    });

    return {
      message: 'Points burned successfully',
      points: rule.max_redeemption_points_limit,
      transaction_id: tx.id,
      available_balance: walletInfo.available_balance,
      locked_balance: walletInfo.locked_balance,
      total_balance: walletInfo.total_balance,
      discount: discountAmount,
      payable_amount: total_amount - discountAmount,
    };
  }

  async handleCampaignEarning(payload) {
    const {
      wallet,
      order,
      rule_info,
      campaign_type,
      campaign_id,
      coupon_info,
      metadata,
      langCode,
    } = payload;
    const { amount } = order ?? {};

    switch (campaign_type) {
      case 'POINTS': {
        // Step 1: get matching rule
        const { campaign_uuid, matchedRule } = await this.handleCampaignRules({
          customer_id: wallet.customer.id,
          business_unit_id: wallet.business_unit.id,
          rule_info,
          wallet,
          campaign_id,
          total_amount: amount,
          langCode,
        });

        if (!matchedRule) {
          throw new BadRequestException('No rule found for this event.');
        }

        this.validateSpecialConditions(matchedRule, wallet, rule_info);
        await this.checkAlreadyRewaredPoints(
          wallet?.business_unit.id,
          wallet?.id,
          matchedRule,
        );

        const savedTx = await this.creditWallet({
          point_balance: matchedRule.reward_points || 0,
          prev_available_points: wallet.available_balance,
          wallet,
          amount: matchedRule.reward_points,
          sourceType:
            matchedRule.rule_type === 'dynamic rule'
              ? matchedRule.condition_type
              : matchedRule.event_triggerer,
          description: `Earned ${matchedRule.reward_points} points${
            matchedRule?.locales?.[0]?.name
              ? ` (${matchedRule.locales[0].name})`
              : ''
          }`,
          validityAfterAssignment: matchedRule.validity_after_assignment,
          order,
        });

        await this.createCustomerActivity({
          customer_uuid: wallet.customer.uuid,
          activity_type: 'rule',
          campaign_uuid,
          rule_id: matchedRule.id,
          rule_name: matchedRule?.locales?.[0]?.name,
          amount: matchedRule.reward_points || 0,
        });

        return {
          message: 'Points earned successfully',
          points: savedTx.amount,
          status: savedTx.status,
          transaction_id: savedTx.id,
          available_balance: wallet.available_balance,
          locked_balance: wallet.locked_balance,
          total_balance: wallet.total_balance,
        };
      }
      case 'COUPONS': {
        return await this.handleCampaignCoupons({
          campaign_id,
          wallet,
          coupon_info,
          amount,
          order,
          metadata,
          langCode,
        });
      }
      default:
        throw new BadRequestException(
          `Unsupported campaign type: ${campaign_type}`,
        );
    }
  }

  async handleRuleEarning(payload, langCode = 'en') {
    const { wallet, rule_info, order } = payload;

    // Step 1: Resolve matching rule
    const matchedRule = await this.getRule(rule_info.uuid, order, langCode);
    if (!matchedRule) {
      throw new BadRequestException('No earning rule found for this event.');
    }

    this.validateSpecialConditions(matchedRule, wallet, rule_info);
    await this.checkAlreadyRewaredPoints(
      wallet?.business_unit.id,
      wallet?.id,
      matchedRule,
    );

    const savedTx = await this.creditWallet({
      wallet,
      point_balance: matchedRule.reward_points || 0,
      prev_available_points: wallet.available_balance,
      amount: matchedRule.reward_points || 0,
      sourceType:
        matchedRule.rule_type === 'dynamic rule'
          ? matchedRule.condition_type
          : matchedRule.event_triggerer,
      description: `Earned ${matchedRule.reward_points} points${
        matchedRule?.locales?.[0]?.name
          ? ` (${matchedRule.locales[0].name})`
          : ''
      }`,
      validityAfterAssignment: matchedRule.validity_after_assignment,
      order,
    });

    await this.createCustomerActivity({
      customer_uuid: wallet.customer.uuid,
      activity_type: 'rule',
      rule_id: matchedRule.id,
      rule_name: matchedRule?.locales?.[0]?.name || '',
      amount: matchedRule.reward_points || 0,
    });

    return {
      success: true,
      points: savedTx.amount,
    };
  }

  async getRule(uuid, order, langCode = 'en') {
    const { amount } = order ?? {};
    const query = this.ruleRepo
      .createQueryBuilder('rule')
      .leftJoinAndSelect('rule.locales', 'locale')
      .leftJoinAndSelect('locale.language', 'language')
      .where('rule.status = :status', { status: 1 })
      .andWhere('rule.uuid = :uuid', { uuid })
      .andWhere('rule.rule_type != :ruleType', { ruleType: 'burn' });

    if (langCode) {
      query.andWhere('language.code = :langCode', { langCode });
    }

    const rule = await query.getOne();

    if (rule?.rule_type === 'spend and earn' && !amount) {
      throw new BadRequestException(`Amount is required`);
    }

    if (amount && amount < rule?.min_amount_spent) {
      throw new BadRequestException(
        `Minimum amount to earn points is ${rule.min_amount_spent}`,
      );
    }

    if (
      rule.reward_condition === 'perAmount' &&
      amount >= rule?.min_amount_spent
    ) {
      const multiplier = amount / rule?.min_amount_spent;
      rule.reward_points = multiplier * rule.reward_points;
    }

    return rule;
  }

  private validateSpecialConditions(
    matchedRule: any,
    wallet: any,
    rule_info: any,
  ) {
    // Birthday
    if (matchedRule.event_triggerer === 'birthday') {
      const today = new Date();
      const dob = new Date(wallet.customer.DOB);
      const isBirthday =
        today.getDate() === dob.getDate() &&
        today.getMonth() === dob.getMonth();

      if (!isBirthday) {
        throw new BadRequestException(
          "Today is not your birthday, so you're not eligible.",
        );
      }
    }

    // Dynamic rule
    if (matchedRule.rule_type === 'dynamic rule') {
      if (matchedRule.condition_type !== rule_info.condition_type) {
        throw new BadRequestException(
          `Expected condition '${matchedRule.condition_type}' but got '${rule_info.condition_type}'`,
        );
      }

      const isSatisfy = this.isSatisfyingDynamicCondition(
        rule_info.condition_value,
        matchedRule.condition_operator,
        matchedRule.condition_value,
      );

      if (!isSatisfy) {
        throw new BadRequestException(
          `Condition '${matchedRule.condition_type}' did not satisfy '${matchedRule.condition_operator} ${matchedRule.condition_value}'`,
        );
      }
    }
  }

  async checkAlreadyRewaredPoints(business_unit_id, wallet_id, matchedRule) {
    const { frequency, event_triggerer, rule_type, condition_type } =
      matchedRule;

    const previousRewards = await this.txRepo.find({
      where: {
        business_unit: { id: business_unit_id },
        wallet: { id: wallet_id },
      },
    });

    const currentDate = new Date();

    const isSameYear = (d1: Date, d2: Date) =>
      d1.getFullYear() === d2.getFullYear();

    const isSameDate = (d1: Date, d2: Date) =>
      // d1.toDateString() === d2.toDateString();
      d1.getHours() === d2.getHours() &&
      d1.getMinutes() === d2.getMinutes() &&
      d1.getSeconds() === d2.getSeconds();

    const triggerer =
      rule_type === 'dynamic rule' ? condition_type : event_triggerer;

    const hasBeenRewarded = () => {
      if (!previousRewards.length) return false;

      const matchingRewards = previousRewards.filter(
        (reward) => reward.source_type === triggerer,
      );

      if (!matchingRewards.length) return false;

      return matchingRewards.some((reward) => {
        const rewardDate = new Date(reward.created_at);

        switch (frequency) {
          case 'once': {
            return true;
          }

          case 'daily': {
            const today = dayjs().startOf('day');
            const rewardedDate = dayjs(reward.created_at).startOf('day');
            if (rewardedDate.isSame(today)) {
              throw new BadRequestException(
                'Already rewarded today, try again tomorrow',
              );
            }
            break;
          }

          case 'monthly': {
            const today = dayjs();
            const rewardedDate = dayjs(reward.created_at);
            if (
              rewardedDate.month() === today.month() &&
              rewardedDate.year() === today.year()
            ) {
              throw new BadRequestException(
                'Already rewarded this month, try again next month',
              );
            }
            break;
          }

          case 'yearly': {
            return isSameYear(rewardDate, currentDate);
          }

          case 'anytime': {
            return isSameDate(rewardDate, currentDate);
          }

          default:
            return false;
        }
      });
    };

    if (hasBeenRewarded()) {
      throw new BadRequestException('Already rewarded');
    }
  }

  async handleCampaignRules(bodyPayload) {
    const { total_amount, rule_info, wallet, campaign_id, langCode } =
      bodyPayload;
    try {
      const today = new Date();
      const query = this.campaignRepository
        .createQueryBuilder('campaign')
        .leftJoinAndSelect('campaign.rules', 'campaignRules')
        .leftJoinAndSelect('campaignRules.rule', 'rule')
        .leftJoinAndSelect('campaign.tiers', 'campaignTiers')
        .leftJoinAndSelect('campaignTiers.tier', 'tier')
        .leftJoinAndSelect('tier.locales', 'locale')
        .leftJoinAndSelect('locale.language', 'language')
        .leftJoinAndSelect('campaign.business_unit', 'business_unit')
        .leftJoinAndSelect('campaign.coupons', 'coupons')
        .leftJoinAndSelect('campaign.customerSegments', 'customerSegments')
        .leftJoinAndSelect('customerSegments.segment', 'segment')
        .where('campaign.uuid = :campaign_id', { campaign_id })
        .andWhere('campaign.status = :status', { status: 1 })
        .andWhere('campaign.start_date <= :today', { today })
        .andWhere('campaign.end_date >= :today', { today })
        .orderBy('campaign.created_at', 'DESC');

      if (langCode) {
        query.andWhere('language.code = :langCode', { langCode });
      }

      const campaign = await query.getOne();

      if (campaign) {
        const campaignId = campaign.id;
        const customerId = wallet.customer.id;

        // Segment validation
        const hasSegments = await this.campaignCustomerSegmentRepo.find({
          where: { campaign: { id: campaign.id } },
          relations: ['segment'],
        });

        if (hasSegments.length > 0) {
          // Extract segment IDs
          const segmentIds = hasSegments.map((cs) => cs.segment.id);
          if (segmentIds.length === 0) {
            throw new ForbiddenException('Customer segment not found');
          }
          const match = await this.customerSegmentMemberRepository.findOne({
            where: {
              segment: { id: In(segmentIds) },
              customer: { id: customerId },
            },
          });
          if (!match) {
            throw new ForbiddenException(
              'Customer is not eligible for this campaign',
            );
          }
        }

        const query = this.campaignRuleRepo
          .createQueryBuilder('campaignRule')
          .leftJoinAndSelect('campaignRule.rule', 'rule')
          .leftJoinAndSelect('rule.locales', 'locale')
          .leftJoinAndSelect('locale.language', 'language')
          .where('campaignRule.campaign = :campaignId', { campaignId })
          .andWhere('rule.status = :status', { status: 1 })
          .andWhere('rule.uuid = :uuid', { uuid: rule_info.uuid });

        if (langCode) {
          query.andWhere('language.code = :langCode', { langCode });
        }

        const campaignRule = await query.getOne();
        const rule = campaignRule?.rule;

        let conversionRate = 1;
        // customer eligible tier checking
        const campaignTiers = campaign.tiers || [];
        if (campaignTiers.length > 0) {
          const currentCustomerTier =
            await this.tiersService.getCurrentCustomerTier(
              customerId,
              langCode,
            );
          const matchedTier = campaignTiers.find((ct) => {
            return (
              ct.tier &&
              currentCustomerTier?.tier &&
              ct.tier?.locales?.[0]?.name === currentCustomerTier.tier.name &&
              ct.tier.level === currentCustomerTier.tier.level
            );
          });

          if (matchedTier) {
            conversionRate = matchedTier.point_conversion_rate;
          } else {
            throw new ForbiddenException(
              'Customer tier is not eligible for this campaign',
            );
          }
        }

        if (
          rule?.rule_type === 'spend and earn' &&
          (total_amount === undefined ||
            total_amount === null ||
            total_amount === '')
        ) {
          throw new BadRequestException(`Amount is required`);
        }

        if (total_amount) {
          if (total_amount < rule?.min_amount_spent) {
            throw new BadRequestException(
              `Minimum amount to earn points is ${rule.min_amount_spent}`,
            );
          }
        }

        if (
          rule.reward_condition === 'perAmount' &&
          total_amount >= rule?.min_amount_spent
        ) {
          const multiplier = Math.floor(total_amount / rule?.min_amount_spent);
          rule.reward_points = multiplier * rule.reward_points;
        }

        rule['reward_points'] = rule.reward_points * conversionRate;
        return { campaign_uuid: campaign.uuid, matchedRule: rule };
      }

      throw new NotFoundException(
        'Campaign not found or it may not started yet',
      );
    } catch (error) {
      throw new BadRequestException(error?.message || 'Something went wrong');
    }
  }

  isSatisfyingDynamicCondition(
    contextValue: any,
    operator: string,
    conditionValue: any,
  ): boolean {
    switch (operator) {
      case '==':
        return contextValue == conditionValue;
      case '!==':
        return contextValue !== conditionValue;
      case '>':
        return contextValue > conditionValue;
      case '<':
        return contextValue < conditionValue;
      case '>=':
        return contextValue >= conditionValue;
      case '<=':
        return contextValue <= conditionValue;
      default:
        console.warn('Unsupported operator:', operator);
        return false;
    }
  }

  async checkAlreadyRewaredCoupons(customer_uuid, coupon_uuid, coupon) {
    const previousRewards = await this.customeractivityRepo.find({
      where: {
        customer_uuid: customer_uuid,
        coupon_uuid: coupon_uuid,
      },
    });

    // Check per-user limit
    if (
      coupon.max_usage_per_user &&
      previousRewards.length >= coupon.max_usage_per_user
    ) {
      throw new BadRequestException(
        'You have reached the maximum usage limit for this coupon',
      );
    }
  }

  async handleCampaignCoupons(bodyPayload) {
    const { campaign_id, wallet, amount, order, metadata, langCode } =
      bodyPayload;
    const today = new Date();

    const query = this.campaignRepository
      .createQueryBuilder('campaign')
      .leftJoinAndSelect('campaign.rules', 'campaignRules')
      .leftJoinAndSelect('campaignRules.rule', 'rule')
      .leftJoinAndSelect('campaign.tiers', 'campaignTiers')
      .leftJoinAndSelect('campaignTiers.tier', 'tier')
      .leftJoinAndSelect('tier.locales', 'locale')
      .leftJoinAndSelect('locale.language', 'language')
      .leftJoinAndSelect('campaign.business_unit', 'business_unit')
      .leftJoinAndSelect('campaign.coupons', 'coupons')
      .leftJoinAndSelect('campaign.customerSegments', 'customerSegments')
      .leftJoinAndSelect('customerSegments.segment', 'segment')
      .where('campaign.uuid = :campaign_id', { campaign_id })
      .andWhere('campaign.status = :status', { status: 1 })
      .andWhere('campaign.start_date <= :today', { today })
      .andWhere('campaign.end_date >= :today', { today });

    if (langCode) {
      query.andWhere('language.code = :langCode', { langCode });
    }

    const campaign = await query.getOne();

    if (campaign) {
      const campaignId = campaign.id;
      const customerId = wallet.customer.id;

      // Segment validation
      const hasSegments = await this.campaignCustomerSegmentRepo.find({
        where: { campaign: { id: campaign.id } },
        relations: ['segment'],
      });

      if (hasSegments.length > 0) {
        // Extract segment IDs
        const segmentIds = hasSegments.map((cs) => cs.segment.id);

        if (segmentIds.length === 0) {
          return false;
        }

        const match = await this.customerSegmentMemberRepository.findOne({
          where: {
            segment: { id: In(segmentIds) },
            customer: { id: customerId },
          },
        });

        if (!match) {
          throw new ForbiddenException(
            'Customer is not eligible for this campaign',
          );
        }
      }

      // customer eligible tier checking
      const campaignTiers = campaign.tiers || [];
      if (campaignTiers.length > 0) {
        const currentCustomerTier =
          await this.tiersService.getCurrentCustomerTier(customerId, langCode);
        const matchedTier = campaignTiers.find((ct) => {
          return (
            ct.tier &&
            currentCustomerTier?.tier &&
            ct.tier?.locales?.[0]?.name === currentCustomerTier.tier.name &&
            ct.tier.level === currentCustomerTier.tier.level
          );
        });

        if (!matchedTier) {
          throw new ForbiddenException(
            'Customer tier is not eligible for this campaign',
          );
        }
      }

      const campaignCoupon = await this.campaignCouponRepo.findOne({
        where: {
          campaign: { id: campaignId },
          coupon: {
            uuid: metadata.uuid,
          },
        },
        relations: ['coupon'],
      });

      // Coupon Not Found
      if (!campaignCoupon) {
        throw new BadRequestException('Coupon not found');
      }

      const coupon = campaignCoupon.coupon;

      const now = new Date();

      // Check From Date
      if (coupon.date_from && now < coupon.date_from) {
        throw new BadRequestException('Coupon is not yet valid');
      }

      // Coupon is expried
      if (coupon.date_to && coupon.date_to < now && coupon?.status === 0) {
        throw new BadRequestException('This coupon has been expired!');
      }

      // Coupon is inactive
      if (coupon.status === 0)
        throw new BadRequestException('Coupon is not active');

      // Check reuse interval for this user
      const lastUsage = await this.userCouponRepo.findOne({
        where: { customer: { id: customerId }, coupon_code: coupon.code },
        order: { redeemed_at: 'DESC' },
      });

      if (lastUsage && coupon.reuse_interval > 0) {
        const nextAvailable = new Date(lastUsage.redeemed_at);
        nextAvailable.setDate(nextAvailable.getDate() + coupon.reuse_interval);

        if (now < nextAvailable) {
          throw new BadRequestException(
            `You can reuse this coupon after ${nextAvailable.toDateString()}`,
          );
        }
      }

      // Check total usage limit
      if (
        coupon.usage_limit &&
        coupon.number_of_times_used >= coupon.usage_limit
      ) {
        const errMsgEn =
          // coupon.errors?.general_error_message_en ||
          'Coupon usage limit reached';
        const errMsgAr =
          // coupon.errors?.general_error_message_ar ||
          'تم الوصول إلى الحد الأقصى لاستخدام القسيمة';

        throw new BadRequestException(`${errMsgEn} / ${errMsgAr}`);
      }

      if (coupon?.coupon_type_id === null) {
        const conditions = coupon?.complex_coupon;
        const result = await this.validateComplexCouponConditions(
          metadata.complex_coupon,
          conditions,
          wallet,
          coupon,
        );
        if (!result.valid) {
          throw new BadRequestException(result.message);
        }
      } else {
        const couponType = await this.couponTypeService.findOne(
          coupon?.coupon_type_id,
        );

        if (couponType.coupon_type === 'BIRTHDAY') {
          const today = new Date();
          const dob = new Date(wallet.customer.DOB);
          const isBirthday =
            today.getDate() === dob.getDate() &&
            today.getMonth() === dob.getMonth();

          if (!isBirthday) {
            throw new BadRequestException(
              "Today is not your birthday, so you're not eligible.",
            );
          }
        } else if (couponType.coupon_type === 'TIER_BASED') {
          const customerTierInfo =
            await this.tiersService.getCurrentCustomerTier(wallet.customer.id);

          const cutomerFallInTier = metadata.conditions.find(
            (singleTier) => singleTier.tier === customerTierInfo.tier.id,
          );
          coupon.discount_type = 'percentage_discount';
          coupon.discount_price = cutomerFallInTier.value;
        } else if (couponType.coupon_type === 'USER_SPECIFIC') {
          const decryptedEmail = await this.ociService.decryptData(
            wallet.customer.email,
          );
          const decryptedPhone = await this.ociService.decryptData(
            wallet.customer.phone,
          );
          const isApplicableForUser = await this.matchConditions(
            metadata.conditions,
            {
              email: decryptedEmail,
              phone_number: decryptedPhone,
            },
          );
          if (!isApplicableForUser) {
            throw new BadRequestException(
              "you're not eligible for this coupon",
            );
          }
        } else if (
          couponType.coupon_type === 'DISCOUNT' &&
          coupon.conditions == null
        ) {
          // Do nothing it means directly want to give coupon without condtions
        } else {
          const result = this.validateSimpleCouponConditions(
            metadata,
            coupon.conditions,
            couponType,
          );
          if (!result.valid) {
            throw new BadRequestException(result.message);
          }
        }
      }

      await this.checkAlreadyRewaredCoupons(
        wallet.customer.uuid,
        campaignCoupon?.coupon.uuid,
        coupon,
      );

      if (
        coupon.discount_type === 'percentage_discount' &&
        (amount === undefined || amount === null || amount === '')
      ) {
        throw new BadRequestException(`Amount is required`);
      }

      const earnPoints =
        coupon.discount_type === 'fixed_discount'
          ? (coupon.discount_price ?? 0)
          : (amount * Number(coupon.discount_price)) / 100;

      const savedTx = await this.creditWallet({
        point_balance: earnPoints,
        prev_available_points: wallet.available_balance,
        wallet,
        amount: earnPoints,
        sourceType: 'coupon',
        description: `Redeemed ${earnPoints} amount (${coupon.code})`,
        validityAfterAssignment: coupon.validity_after_assignment,
        order,
      });

      await this.createCustomerActivity({
        customer_uuid: wallet.customer.uuid,
        activity_type: 'coupon',
        campaign_uuid: campaign.uuid,
        coupon_uuid: coupon.uuid,
        amount: earnPoints,
      });

      // Update coupon usage
      await this.userCouponRepo.save({
        coupon_code: coupon.code,
        status: CouponStatus.USED,
        redeemed_at: new Date(),
        customer: { id: wallet.customer.id },
        business_unit: { id: wallet.business_unit.id },
        issued_from_type: 'coupon',
        issued_from_id: coupon.id,
      });

      coupon.number_of_times_used = Number(coupon.number_of_times_used + 1);
      await this.couponRepo.save(coupon);

      return {
        message: 'Coupon redeemed successfully',
        amount: Number(savedTx.amount),
        status: savedTx?.status,
        transaction_id: savedTx.id,
        available_balance: savedTx?.wallet?.available_balance,
        locked_balance: savedTx?.wallet?.locked_balance,
        total_balance: savedTx?.wallet?.total_balance,
      };
    }
    throw new NotFoundException('Campaign not found or it may not started yet');
  }

  async validateComplexCouponConditions(
    userCouponInfo,
    dbCouponInfo,
    wallet,
    coupon,
  ) {
    const failedConditions: any = [];
    for (const userCoupon of userCouponInfo) {
      const match = dbCouponInfo.find(
        (dbCoupon) =>
          dbCoupon.selectedCouponType === userCoupon.selectedCouponType,
      );

      // Coupon Type mismatch in userCouponInfo and dbCouponInfo
      if (!match) {
        failedConditions.push(
          `No matching condition type found for '${userCoupon.selectedCouponType}'`,
        );
        continue;
      }

      if (match.selectedCouponType === 'BIRTHDAY') {
        const today = new Date();
        const dob = new Date(wallet.customer.DOB);
        const isBirthday =
          today.getDate() === dob.getDate() &&
          today.getMonth() === dob.getMonth();

        if (!isBirthday) {
          failedConditions.push(
            "Today is not your birthday, so you're not eligible.",
          );
          continue;
        }
      } else if (match.selectedCouponType === 'TIER_BASED') {
        const customerTierInfo = await this.tiersService.getCurrentCustomerTier(
          wallet.customer.id,
        );

        const cutomerFallInTier = match.dynamicRows.find(
          (singleTier) => singleTier.tier === customerTierInfo?.tier?.id,
        );

        if (!cutomerFallInTier?.tier) {
          failedConditions.push(`Customer doesn't fall in any tier`);
          continue;
        }

        coupon['discount_type'] = 'percentage_discount';
        coupon['discount_price'] = cutomerFallInTier.value;
      } else {
        // condition length mismatch in userCouponInfo and dbCouponInfo
        if (userCoupon.dynamicRows.length !== match.dynamicRows.length) {
          failedConditions.push(
            `condition not satisfied '${userCoupon.selectedCouponType}'`,
          );
          continue;
        }

        for (let i = 0; i < userCoupon.dynamicRows.length; i++) {
          const userRow = userCoupon.dynamicRows[i];
          const dbRow = match.dynamicRows[i];

          if (
            !(
              userRow.type === dbRow.type &&
              userRow.operator === dbRow.operator &&
              userRow.value === dbRow.value
            )
          ) {
            failedConditions.push(
              `No matching condition '${userCoupon.selectedCouponType}'`,
            );
            continue;
          }
        }
      }
    }

    if (failedConditions.length > 0) {
      return {
        valid: false,
        message: `Coupon not applicable: \n${failedConditions.join('\n')}`,
      };
    }

    return { valid: true, message: 'Coupon is applicable.' };
  }

  validateSimpleCouponConditions(userCouponInfo, dbCouponInfo, couponType) {
    const failedConditions: any = [];

    for (const userCoupon of userCouponInfo.conditions) {
      const matched = dbCouponInfo.find((cond: any) => {
        const baseMatch =
          cond.type === userCoupon.type &&
          (cond.operator === '' && cond.value === ''
            ? true
            : cond.operator === userCoupon.operator &&
              String(cond.value) === String(userCoupon.value));

        if (couponType.coupon_type === 'VEHICLE_SPECIFIC') {
          const makeMatch =
            userCoupon.make !== undefined
              ? cond.make === userCoupon.make
              : true;
          const yearMatch =
            userCoupon.year !== undefined
              ? cond.year === userCoupon.year
              : true;
          const modelMatch =
            userCoupon.model !== undefined
              ? cond.model === userCoupon.model
              : true;

          const variantMatch =
            userCoupon.variant !== undefined
              ? Array.isArray(cond.variant) &&
                Array.isArray(userCoupon.variant) &&
                cond.variant.length === userCoupon.variant.length &&
                cond.variant.every((v: any) => userCoupon.variant.includes(v))
              : true;

          return (
            baseMatch && makeMatch && yearMatch && modelMatch && variantMatch
          );
        }

        return baseMatch;
      });

      if (!matched) {
        failedConditions.push(`Missing condition: "${userCoupon.type}"`);
        continue;
      }
    }

    if (failedConditions.length > 0) {
      return {
        valid: false,
        message: `Coupon not applicable:\n${failedConditions.join('\n')}`,
      };
    }

    return { valid: true, message: 'Coupon is applicable.' };
  }

  matchConditions(couponConditions, customer) {
    return couponConditions.every((condition) => {
      const valuesArray = condition.value.split(',').map((v) => v.trim());

      switch (condition.type) {
        case 'EMAIL': {
          return condition.operator === '=='
            ? valuesArray.includes(customer.email)
            : !valuesArray.includes(customer.email);
        }

        case 'PHONE_NUMBER': {
          return condition.operator === '=='
            ? valuesArray.includes(customer.phone_number)
            : !valuesArray.includes(customer.phone_number);
        }

        // case 'NOT_APPLICABLE':
        //   return condition.operator === '=='
        //     ? valuesArray.includes(customer.email) ||
        //         valuesArray.includes(customer.phone_number)
        //     : !valuesArray.includes(customer.email) &&
        //         !valuesArray.includes(customer.phone_number);

        default:
          return false;
      }
    });
  }

  async creditWallet({
    point_balance,
    prev_available_points,
    wallet,
    amount,
    sourceType,
    description,
    validityAfterAssignment,
    order,
  }: {
    point_balance: number;
    prev_available_points: number;
    wallet: any;
    amount: number;
    sourceType: string;
    description: string;
    validityAfterAssignment?: number;
    order?: Partial<WalletOrder>;
  }) {
    // 1. Get wallet settings for specific business unit
    const walletSettings = await this.walletSettingsRepo.findOne({
      where: { business_unit: { id: parseInt(wallet.business_unit.id) } },
    });

    const pendingMethod = walletSettings?.pending_method || 'none';
    const pendingDays = walletSettings?.pending_days || 0;

    // 2. Update wallet balances based on pending method
    if (pendingMethod === 'none') {
      wallet.available_balance += Number(amount);
      wallet.total_balance += Number(amount);
      await this.walletService.updateWalletBalances(wallet.id, {
        available_balance: wallet.available_balance,
        total_balance: wallet.total_balance,
      });
    } else if (pendingMethod === 'fixed_days') {
      wallet.locked_balance += Number(amount);
      wallet.total_balance += Number(amount);
      await this.walletService.updateWalletBalances(wallet.id, {
        locked_balance: wallet.locked_balance,
        total_balance: wallet.total_balance,
      });
    }

    // 3. Save wallet order if provided
    let walletOrderResponse;
    if (order) {
      const walletOrder: Partial<WalletOrder> = {
        ...order,
        wallet: wallet,
        business_unit: wallet.business_unit,
      };
      walletOrderResponse = await this.WalletOrderrepo.save(walletOrder);
    }

    // 4. Create wallet transaction
    const walletTransaction: Partial<WalletTransaction> = {
      wallet: wallet,
      orders: walletOrderResponse,
      business_unit: wallet.business_unit,
      type: WalletTransactionType.EARN,
      source_type: sourceType,
      amount,
      status:
        pendingDays > 0
          ? WalletTransactionStatus.PENDING
          : WalletTransactionStatus.ACTIVE,
      description,
      unlock_date:
        pendingDays > 0 ? dayjs().add(pendingDays, 'day').toDate() : null,
      expiry_date: validityAfterAssignment
        ? pendingDays > 0
          ? dayjs()
              .add(pendingDays + validityAfterAssignment, 'day')
              .toDate()
          : dayjs().add(validityAfterAssignment, 'day').toDate()
        : null,
    };

    // 5. Save and return
    return await this.txRepo.save(walletTransaction);
  }

  /*
      rule.dynamic_conditions: [{"condition_type":"station_id","condition_operator":"==","condition_value":"NCMC001"},
      {"condition_type":"fuel_type","condition_operator":"==","condition_value":"gasoline"},
      {"condition_type":"quantity","condition_operator":"==","condition_value":"3.5 litter"},
      {"condition_type":"amount","condition_operator":"==","condition_value":"10"}]

      "metadata": {
        "station_id": "NCMC_station_002",
        "fuel_type": "High Octance",
        "quantity": "5 Litter",
        "amount": 10
      }
  */

  /**
   * This function checks if the provided metadata matches ANY of the rule's dynamic conditions.
   * It returns true if at least one condition matches, false otherwise.
   *
   * For the example above, it will compare each condition in rule.dynamic_conditions
   * against the corresponding value in metadata:
   * - For "station_id", it will check if "NCMC_station_002" === "NCMC001" (false)
   * - For "fuel_type", it will check if "High Octance" === "gasoline" (false)
   * - For "quantity", it will check if "5 Litter" === "3.5 litter" (false)
   * - For "amount", it will check if 10 === 10 (true)
   *
   * Since at least one condition ("amount") matches, the function will return true.
   *
   * Note: The function uses .some(), so it only requires one match to return true.
   * If you want ALL conditions to match, use .every() instead.
   */
  validateRuleAgainstMetadata(rule: any, metadata: Record<string, any>) {
    // case sensitive should also be check here
    return rule.dynamic_conditions.some((cond: any) => {
      const metaValue = metadata[cond.condition_type];
      switch (cond.condition_operator) {
        case '==':
          return String(metaValue) === String(cond.condition_value);
        case '>':
          return Number(metaValue) > Number(cond.condition_value);
        case '<':
          return Number(metaValue) < Number(cond.condition_value);
        default:
          return false;
      }
    });
  }

  async validateCustomerTenant(customerId, tenantId) {
    const customer = await this.customerRepo.findOne({
      where: { uuid: customerId, status: 1 },
      relations: ['business_unit'],
    });

    if (!customer) {
      throw new NotFoundException(`Customer not found`);
    }

    if (
      customer.business_unit &&
      customer.business_unit.tenant_id === Number(tenantId)
    ) {
      return true;
    }

    return false;
  }

  async gvrEarnWithEvent(bodyPayload: GvrEarnBurnWithEventsDto) {
    const { customer_id, BUId, metadata, tenantId } = bodyPayload;

    // 1. Find customer by uuid
    const customer = await this.customerRepo.findOne({
      where: {
        uuid: customer_id,
        business_unit: { id: parseInt(BUId) },
        status: 1,
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    // 2. Find earning rule by event name (case-insensitive)
    // if (event) {
    //   rule = await this.ruleRepo.findOne({
    //     where: {
    //       status: 1,
    //       name: event,
    //       rule_type: Not('burn'),
    //     },
    //   });
    //   if (!rule)
    //     throw new NotFoundException('Earning rule not found for this event');

    //   if (metadata && metadata?.productitems?.products.length) {
    //     for (const product of metadata.productitems.products) {
    //       let allMatch = true;
    //       for (const condition of rule.dynamic_conditions) {
    //         const isMatch = this.checkMetadataAndDynamicCondition(
    //           product,
    //           condition,
    //         );
    //         if (!isMatch) {
    //           allMatch = false;
    //           break;
    //         }
    //       }
    //       if (allMatch) {
    //         matchedRules.push(rule);
    //         orderAmount[rule.uuid] = product.amount || 0;
    //       }
    //     }
    //   }
    // } else {
    // to find all rules where dynamic conditions not null for this specific tenant.
    // one tenant user can earn points with differnet BU inside that's why.
    const rules = await this.ruleRepo.find({
      where: {
        status: 1,
        // shoudl add tenant..
        rule_type: Not('burn'),
        tenant_id: Number(tenantId),
        dynamic_conditions: Not(IsNull()),
      },
    });

    // matchedRules holds all earning rules (from the rules array) whose
    // dynamic conditions are satisfied by at least one product in the
    // metadata.productitems.products array.
    let matchedRules = [];
    // orderAmount is an object that maps each matched rule's uuid to the corresponding product's amount.
    // It is used to keep track of the amount associated with each rule that matches the dynamic conditions for a product.
    const orderAmount = {};

    if (!rules && rules?.length === 0) {
      throw new NotFoundException('Earning rule not found');
    }

    // Loop through all earning rules to find which rules match the products in the metadata
    // Yes, with the current logic, if multiple rules match a single product, all those rules will be pushed into matchedRules.
    // Each rule is checked independently against each product, so if a product satisfies the dynamic conditions of multiple rules,
    // all those rules will be included in matchedRules (potentially with duplicate rules if multiple products match the same rule).
    // If you want to avoid duplicates, you can use a Set or check before pushing.

    for (let index = 0; index < rules.length; index++) {
      const eachRule = rules[index];
      for (const product of metadata?.productitems?.products) {
        let allMatch = true;
        // Check if the product satisfies all dynamic conditions of the rule
        for (const condition of eachRule?.dynamic_conditions) {
          // Check if the current product satisfies the current dynamic condition of the rule.
          // This function compares the product's property (specified by condition_type) with the expected value (condition_value)
          // using the specified operator (condition_operator). Returns true if the condition is met, false otherwise.
          const isMatch = this.checkMetadataAndDynamicCondition(
            product,
            condition,
          );
          if (!isMatch) {
            allMatch = false;
            break;
          }
        }

        // If all conditions are matched for this product and rule
        if (allMatch) {
          // Add the rule to matchedRules array
          matchedRules.push(eachRule);
          // Store the product's amount for this rule's uuid
          orderAmount[eachRule.uuid] = product.amount || 0;
        }
      }
    }
    // }

    const customerBURules = matchedRules.filter(
      (singleRule) => singleRule.business_unit_id === BUId,
    );
    if (customerBURules.length) {
      matchedRules = customerBURules;
    } else {
      const grouped = matchedRules.reduce((acc, item) => {
        if (!acc[item.business_unit_id]) {
          acc[item.business_unit_id] = [];
        }
        acc[item.business_unit_id].push(item);
        return acc;
      }, {});

      const groupIds = Object.keys(grouped);
      const singleGroupId =
        groupIds[Math.floor(Math.random() * groupIds.length)];
      const matchedGroup = grouped[singleGroupId];
      matchedRules = matchedGroup;
    }

    if (!matchedRules?.length) {
      throw new NotFoundException('Earning rule not found');
    }

    let rule;
    let totalRewardPoints = 0;
    for (let index = 0; index <= matchedRules.length - 1; index++) {
      rule = matchedRules[index];

      // 3. Get customer wallet info
      const wallet = await this.walletService.getSingleCustomerWalletInfoById(
        customer.id,
      );
      if (!wallet) throw new NotFoundException('Wallet not found');

      // 4. Check frequency and if user already got this reward
      // const alreadyRewarded = false;
      // Find previous wallet transaction for this event, customer, and business_unit
      const txWhere: any = {
        wallet: { id: wallet.id },
        business_unit: { id: parseInt(BUId) },
        type: 'earn',
        // source_type: event,
      };

      const previousTx = await this.txRepo.findOne({
        where: txWhere,
        order: { created_at: 'DESC' },
      });

      // Frequency logic
      if (rule.frequency === 'once' && previousTx) {
        if (matchedRules.length > 1) {
          continue;
        }
        throw new BadRequestException(
          'Reward for this event already granted (once per customer)',
        );
      }
      if (rule.frequency === 'daily' && previousTx) {
        // Check if already rewarded today
        const today = dayjs().startOf('day');
        const txDate = dayjs(previousTx.created_at).startOf('day');
        if (txDate.isSame(today)) {
          if (matchedRules.length > 1) {
            continue;
          }
          throw new BadRequestException(
            'Reward for this event already granted today',
          );
        }
      }
      if (rule.frequency === 'yearly' && previousTx) {
        // Check if already rewarded this year
        const thisYear = dayjs().year();
        const txYear = dayjs(previousTx.created_at).year();
        if (txYear === thisYear) {
          if (matchedRules.length > 1) {
            continue;
          }
          throw new BadRequestException(
            'Reward for this event already granted this year',
          );
        }
      }

      // 5. Calculate reward points
      let rewardPoints = rule.reward_points;
      const Orderamount = orderAmount[rule.uuid]
        ? Number(orderAmount[rule.uuid])
        : undefined;

      if (['spend and earn', 'dynamic rule'].includes(rule.rule_type)) {
        if (!Orderamount) {
          throw new BadRequestException(
            'Amount is required for spend and earn rule',
          );
        }
        // in this case give rewards in the multple of what user spends.
        if (rule.reward_condition === 'perAmount') {
          if (Orderamount < rule.min_amount_spent) {
            if (matchedRules.length > 1) {
              continue;
            }
            throw new BadRequestException(
              `Minimum amount to earn points is ${rule.min_amount_spent}`,
            );
          }
          // Points per amount spent
          const multiplier = Math.floor(Orderamount / rule.min_amount_spent);
          rewardPoints = multiplier * rewardPoints;
        } else if (
          rule.reward_condition === 'minimum' ||
          rule.reward_condition === null
        ) {
          if (Orderamount < rule.min_amount_spent) {
            if (matchedRules.length > 1) {
              continue;
            }

            throw new BadRequestException(
              `Minimum amount to earn points is ${rule.min_amount_spent}`,
            );
          }
          // Give fixed reward points, I think, don't need to assign it again.
          // rewardPoints = rule.reward_points;
        }
      }

      if (!rewardPoints || rewardPoints <= 0) {
        throw new BadRequestException('No reward points to grant');
      }

      const walletSettings = await this.walletSettingsRepo.findOne({
        where: { business_unit: { id: parseInt(BUId) } },
      });

      // 6. Check business unit's pending_method
      const pendingMethod = walletSettings?.pending_method || 'none';
      const pendingDays = walletSettings?.pending_days || 0;
      // Via the cron job to unlcok these locked balance on each midnight.

      // 7. Update wallet balances because it is priority
      if (pendingMethod === 'none') {
        // Immediately add to available_balance and total_balance
        wallet.available_balance += rewardPoints;
        wallet.total_balance += rewardPoints;
        await this.walletService.updateWalletBalances(wallet.id, {
          available_balance: wallet.available_balance,
          total_balance: wallet.total_balance,
        });
      } else if (pendingMethod === 'fixed_days') {
        // Add to locked_balance and total_balance, available_balance unchanged
        wallet.locked_balance += rewardPoints;
        wallet.total_balance += rewardPoints;
        await this.walletService.updateWalletBalances(wallet.id, {
          locked_balance: wallet.locked_balance,
          total_balance: wallet.total_balance,
        });
        // Cron job will unlock after pending_days
      }

      // 8. Now, we need to generate wallet_order if any
      // const walletOrderId: number | null = null;
      // Try to map metadata to wallet_order if possible (optional, depends on event)
      // For event-based, wallet_order may not exist, so we keep it null
      let walletOrderRes;
      if (metadata) {
        // Check if metadata is present, is an object, and contains 'amount'
        if (
          metadata &&
          typeof metadata === 'object' &&
          Orderamount !== undefined
        ) {
          // You can access metadata.amount here if needed
          // For example, you might want to log or process the amount
          // Add any additional logic here as required

          const walletOrder: Partial<WalletOrder> = {
            wallet: wallet, // pass the full Wallet entity instance
            // wallet_order_id: walletOrderId,
            business_unit: wallet.business_unit, // pass the full BusinessUnit entity instance
            amount: Orderamount,
            metadata,
            discount: 0,
            subtotal: Orderamount,
          };

          // Save order or metatDataInfo
          walletOrderRes = await this.WalletOrderrepo.save(walletOrder);
        }
      }

      // 9. Create wallet_transaction
      const walletTransaction: Partial<WalletTransaction> = {
        wallet: wallet, // pass the full Wallet entity instance
        orders: walletOrderRes,
        // wallet_order_id: walletOrderId,
        business_unit: wallet.business_unit, // pass the full BusinessUnit entity instance
        type: WalletTransactionType.EARN,
        source_type: rule.name,
        amount: Orderamount || 0,
        prev_available_points: wallet.available_balance,
        status:
          pendingDays > 0
            ? WalletTransactionStatus.PENDING
            : WalletTransactionStatus.ACTIVE,
        description: `Earned ${rewardPoints} points (${rule.name})`,
        // Set the unlock_date for the wallet transaction.
        // If there are pendingDays (i.e., points are locked for a period), set unlock_date to the date after pendingDays.
        // Otherwise, set unlock_date to null (no unlock needed).
        unlock_date:
          pendingDays > 0 ? dayjs().add(pendingDays, 'day').toDate() : null,

        point_balance: rewardPoints,

        // Set the expiry_date for the wallet transaction.
        // If the rule has a validity_after_assignment value:
        //   - If there are pendingDays (i.e., points are locked for a period), expiry is after (pendingDays + validity_after_assignment) days.
        //   - If there are no pendingDays, expiry is after validity_after_assignment days.
        // If the rule does not have validity_after_assignment, expiry_date is null (no expiry).
        expiry_date: rule.validity_after_assignment
          ? pendingDays > 0
            ? dayjs()
                .add(pendingDays + rule.validity_after_assignment, 'day')
                .toDate()
            : dayjs().add(rule.validity_after_assignment, 'day').toDate()
          : null,
      };

      // Save transaction
      await this.txRepo.save(walletTransaction);
      totalRewardPoints += rewardPoints;
    }

    return {
      message: 'Points earned successfully',
      points: totalRewardPoints,
    };
  }

  checkMetadataAndDynamicCondition(product, condition) {
    const { condition_type, condition_operator, condition_value } = condition;
    const productValue = product[condition_type];

    switch (condition_operator) {
      case '==':
        return productValue == condition_value;
      case '!=':
        return productValue != condition_value;
      case '>':
        return Number(productValue) > Number(condition_value);
      case '<':
        return Number(productValue) < Number(condition_value);
      case '>=':
        return Number(productValue) >= Number(condition_value);
      case '<=':
        return Number(productValue) <= Number(condition_value);
      default:
        return false;
    }
  }

  async gvrBurnWithEvent(bodyPayload: GvrEarnBurnWithEventsDto) {
    const { customer_id, metadata, tenantId, BUId } = bodyPayload;

    const customerInfo = await this.customerRepo.find({
      where: { uuid: customer_id, status: 1 },
      relations: ['business_unit'],
    });

    const customer = customerInfo[0];
    if (!customer) throw new NotFoundException('Customer not found');

    const wallet = await this.walletRepo.findOne({
      where: { customer: { uuid: customer_id } },
      relations: ['business_unit'],
    });

    if (!wallet) throw new NotFoundException('Wallet not found');

    const txWhere: any = {
      wallet: { id: wallet.id },
      business_unit: { id: parseInt(BUId) },
      type: 'burn',
      // source_type: event,
    };

    const previousTx = await this.txRepo.findOne({
      where: txWhere,
      order: { created_at: 'DESC' },
    });

    let rule;
    let matchedRules = [];
    const orderAmount = {};
    let totalDiscountAmount = 0;
    let totalPoints = 0;

    // if (event) {
    //   rule = await this.ruleRepo.findOne({
    //     where: { name: event, status: 1, rule_type: 'burn' },
    //   });
    //   if (!rule)
    //     throw new NotFoundException('Burn rule not found for this campaign');

    //   if (metadata && metadata?.productitems?.products.length) {
    //     for (const product of metadata?.productitems?.products) {
    //       let allMatch = true;
    //       for (const condition of rule.dynamic_conditions) {
    //         const isMatch = this.checkMetadataAndDynamicCondition(
    //           product,
    //           condition,
    //         );
    //         if (!isMatch) {
    //           allMatch = false;
    //           break;
    //         }
    //       }

    //       if (allMatch) {
    //         matchedRules.push(rule);
    //         orderAmount[rule.uuid] = product.amount || 0;
    //       }
    //     }
    //   }
    // } else {
    const rules = await this.ruleRepo.find({
      where: {
        status: 1,
        tenant_id: Number(tenantId),
        rule_type: 'burn',
        dynamic_conditions: Not(IsNull()),
      },
    });

    for (let index = 0; index < rules.length; index++) {
      const eachRule = rules[index];
      for (const product of metadata.productitems.products) {
        let allMatch = true;
        for (const condition of eachRule.dynamic_conditions) {
          const isMatch = this.checkMetadataAndDynamicCondition(
            product,
            condition,
          );
          if (!isMatch) {
            allMatch = false;
            break;
          }
        }

        if (allMatch) {
          matchedRules.push(eachRule);
          orderAmount[eachRule.uuid] = product.amount || 0;
        }
      }
    }
    // }

    const customerBURules = matchedRules.filter(
      (singleRule) => singleRule.business_unit_id === BUId,
    );
    if (customerBURules.length) {
      matchedRules = customerBURules;
    } else {
      const grouped = matchedRules.reduce((acc, item) => {
        if (!acc[item.business_unit_id]) {
          acc[item.business_unit_id] = [];
        }
        acc[item.business_unit_id].push(item);
        return acc;
      }, {});

      const groupIds = Object.keys(grouped);
      const singleGroupId =
        groupIds[Math.floor(Math.random() * groupIds.length)];
      const matchedGroup = grouped[singleGroupId];
      matchedRules = matchedGroup;
    }

    if (matchedRules.length) {
      for (let index = 0; index <= matchedRules.length - 1; index++) {
        rule = matchedRules[index];

        // Frequency logic
        if (rule.frequency === 'once' && previousTx) {
          if (matchedRules.length > 1) {
            continue;
          }
          throw new BadRequestException(
            'Burn for this event already granted (once per customer)',
          );
        }

        if (rule.frequency === 'daily' && previousTx) {
          // Check if already rewarded today
          const today = dayjs().startOf('day');
          const txDate = dayjs(previousTx.created_at).startOf('day');
          if (txDate.isSame(today)) {
            if (matchedRules.length > 1) {
              continue;
            }
            throw new BadRequestException(
              'Burn for this event already granted today',
            );
          }
        }

        if (rule.frequency === 'yearly' && previousTx) {
          // Check if already rewarded this year
          const thisYear = dayjs().year();
          const txYear = dayjs(previousTx.created_at).year();
          if (txYear === thisYear) {
            if (matchedRules.length > 1) {
              continue;
            }
            throw new BadRequestException(
              'Burn for this event already granted this year',
            );
          }
        }

        const total_amount = orderAmount[rule.uuid]
          ? Number(orderAmount[rule.uuid])
          : undefined;

        if (!total_amount || total_amount === undefined) {
          throw new BadRequestException('Amount is required');
        }

        // Step 5: Validate rule conditions
        if (total_amount < rule.min_amount_spent) {
          if (matchedRules.length > 1) {
            continue;
          }
          throw new BadRequestException(
            `Minimum amount to burn is ${rule.min_amount_spent}`,
          );
        }

        if (wallet.available_balance < rule.max_redeemption_points_limit) {
          if (matchedRules.length > 1) {
            continue;
          }
          throw new BadRequestException(
            `You don't have enough loyalty points, ${rule.max_redeemption_points_limit} loyalty point are required and you've ${wallet.available_balance} loyalty points`,
          );
        }

        // Step 6: Determine applicable conversion rate
        const conversionRate = rule.points_conversion_factor;

        // Step 7: Calculate points and discount
        let discountAmount = 0;
        let pointsToBurn = 0;

        if (rule.burn_type === 'FIXED') {
          pointsToBurn = rule.max_redeemption_points_limit;
          discountAmount = pointsToBurn * conversionRate;

          if (discountAmount > total_amount) {
            discountAmount = total_amount;
            pointsToBurn = total_amount / conversionRate;
          }
        } else if (rule.burn_type === 'PERCENTAGE') {
          discountAmount =
            (total_amount * rule.max_burn_percent_on_invoice) / 100;
          pointsToBurn = rule.max_redeemption_points_limit;
        } else {
          throw new BadRequestException('Invalid burn type in rule');
        }

        const burnPayload = {
          customer_id: customer.id,
          business_unit_id: customer.business_unit.id,
          wallet_id: wallet.id,
          type: WalletTransactionType.BURN,
          amount: discountAmount,
          status: WalletTransactionStatus.ACTIVE,
          source_type: rule.name,
          source_id: rule.id,
          description: `Burned ${pointsToBurn} points for discount of ${discountAmount} on amount ${total_amount}`,
        };

        // 8. Now, we need to generate wallet_order if any
        // const walletOrderId: number | null = null;
        // Try to map metadata to wallet_order if possible (optional, depends on event)
        // For event-based, wallet_order may not exist, so we keep it null
        let walletOrderRes;
        if (metadata) {
          // Check if metadata is present, is an object, and contains 'amount'
          if (
            metadata &&
            typeof metadata === 'object' &&
            total_amount !== undefined
          ) {
            // You can access metadata.amount here if needed
            // For example, you might want to log or process the amount
            // Add any additional logic here as required

            const walletOrder: Partial<WalletOrder> = {
              wallet: wallet, // pass the full Wallet entity instance
              business_unit: wallet.business_unit, // pass the full BusinessUnit entity instance
              amount: total_amount,
              metadata,
              discount: discountAmount,
              subtotal: total_amount - discountAmount,
            };

            // Save order or metatDataInfo
            walletOrderRes = await this.WalletOrderrepo.save(walletOrder);
          }
        }

        // Step 9: Create burn transaction in wallet
        await this.walletService.addTransaction(
          {
            ...burnPayload,
            wallet_order_id: walletOrderRes?.id,
            wallet_id: wallet?.id,
            business_unit_id: customer?.business_unit?.id,
            prev_available_points: wallet.available_balance,
            points_balance: pointsToBurn,
          },
          customer?.id,
          true,
        );

        await this.walletRepo.findOne({
          where: { id: wallet.id },
          relations: ['business_unit'],
        });

        totalDiscountAmount += discountAmount;
        totalPoints += rule.max_redeemption_points_limit;
      }
      return {
        message: 'Points burned successfully',
        points: totalPoints,
        discount: totalDiscountAmount,
      };
    } else {
      throw new BadRequestException('Burn rule not found.');
    }
  }

  async customerInfo(req: Request, body: CustomerDto) {
    const businessUnit = (req as any).businessUnit;
    const { custom_customer_unique_id, customer_phone_number } = body;

    try {
      if (!businessUnit) {
        throw new BadRequestException('Invalid Business Unit Key');
      }

      const customer = await this.customerRepo.findOne({
        where: [
          { phone: customer_phone_number, status: 1 },
          { uuid: custom_customer_unique_id, status: 1 },
        ],
      });

      if (!customer) {
        throw new NotFoundException(`Customer not found`);
      }

      if (
        customer.status == 0 ||
        customer.status == 3 ||
        customer?.is_delete_requested == 1 ||
        customer?.deletion_status == 1
      ) {
        throw new NotFoundException(
          `This customer is no longer active or has been removed`,
        );
      }

      const walletinfo = await this.walletService.getSingleCustomerWalletInfo(
        customer.id,
        businessUnit.id,
      );

      if (!walletinfo) {
        throw new NotFoundException(`Customer wallet not configured`);
      }

      const transactionInfo = await this.walletService.getWalletTransactions(
        walletinfo?.id,
      );

      let total_transaction_amount = 0;
      let total_transaction_count = 0;
      if (transactionInfo && transactionInfo.data.length) {
        total_transaction_count = transactionInfo.data.length;
        for (let index = 0; index <= transactionInfo.data.length - 1; index++) {
          const eachTransaction = transactionInfo.data[index];
          total_transaction_amount += Number(eachTransaction.amount);
        }
      }

      const customerTierInfo = await this.tiersService.getCurrentCustomerTier(
        customer.id,
      );

      return {
        success: true,
        message: 'Customer details fetched successfully',
        result: {
          customer_name: customer.name,
          custom_customer_first_name: customer.first_name,
          custom_customer_last_name: customer.last_name,
          custom_customer_unique_id: customer.uuid,
          customer_referral_code: customer.referral_code,
          custom_customer_loyalty_points: walletinfo.available_balance,
          custom_total_transaction_amount: total_transaction_amount,
          custom_total_transaction_count: total_transaction_count,
          customer_tier: customerTierInfo ? customerTierInfo.tier.name : '',
          // next_expiry_date: '2025-11-20',
          // next_expiry_points: '25030',
        },
        errors: [],
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        message: 'Failed to fetch customer info',
        result: null,
        errors: error.message,
      });
    }
  }

  async burnTransaction(body) {
    const {
      customer_id,
      customer_phone_number,
      transaction_amount,
      from_app,
      remarks,
    } = body;

    try {
      const customer = await this.customerRepo.findOne({
        where: [
          { uuid: customer_id, status: 1 },
          { phone: customer_phone_number, status: 1 },
        ],
        relations: ['tenant', 'business_unit'],
      });

      if (!customer) {
        throw new NotFoundException(`Customer not found`);
      }

      if (customer.status == 0) {
        throw new BadRequestException(`Customer is inactive`);
      }

      if (customer.status === 3) {
        throw new NotFoundException('Customer is deleted');
      }

      const decryptedPhone = await this.ociService.decryptData(customer.phone);

      const wallet = await this.walletService.getSingleCustomerWalletInfo(
        customer.id,
        customer.business_unit.id,
      );

      if (!wallet) {
        throw new NotFoundException(`Customer wallet not configured`);
      }

      // Get active burn rules
      const rules = await this.ruleRepo.find({
        where: {
          rule_type: 'burn',
          tenant: { id: customer.tenant.id },
        },
      });

      if (!rules.length) {
        throw new NotFoundException(`Rules not found`);
      }

      let matchedRule;
      for (const rule of rules) {
        if (transaction_amount >= rule.min_amount_spent) {
          matchedRule = rule;
          break;
        }
      }

      // Validate rule conditions
      if (transaction_amount < matchedRule.min_amount_spent) {
        throw new BadRequestException(
          `Minimum amount to burn is ${matchedRule.min_amount_spent}`,
        );
      }

      if (wallet.available_balance < matchedRule.max_redeemption_points_limit) {
        throw new BadRequestException(
          `You don't have enough loyalty points, ${matchedRule.max_redeemption_points_limit} loyalty point are required and you've ${wallet.available_balance} loyalty points`,
        );
      }

      // Determine applicable conversion rate
      const conversionRate = matchedRule.points_conversion_factor;

      // Calculate points and discount
      let discountAmount = 0;
      let pointsToBurn = 0;

      if (matchedRule.burn_type === 'FIXED') {
        pointsToBurn = matchedRule.max_redeemption_points_limit;
        discountAmount = pointsToBurn * conversionRate;

        if (discountAmount > transaction_amount) {
          discountAmount = transaction_amount;
          pointsToBurn = transaction_amount / conversionRate;
        }
      } else if (matchedRule.burn_type === 'PERCENTAGE') {
        discountAmount =
          (transaction_amount * matchedRule.max_burn_percent_on_invoice) / 100;
        pointsToBurn = matchedRule.max_redeemption_points_limit;
      } else {
        throw new BadRequestException('Invalid burn type in rule');
      }

      // Create burn transaction
      const burnPayload = {
        customer_id: customer.id,
        business_unit_id: customer.business_unit.id,
        wallet_id: wallet.id,
        type: WalletTransactionType.BURN,
        amount: discountAmount,
        status: WalletTransactionStatus.ACTIVE,
        source_type: matchedRule.name,
        source_id: matchedRule.id,
        description: remarks
          ? remarks
          : `Burned ${pointsToBurn} points for discount of ${discountAmount} on amount ${transaction_amount}`,
        external_program_type: from_app ? from_app : null,
      };

      const tx = await this.walletService.addTransaction(
        {
          ...burnPayload,
          wallet_order_id: null,
          wallet_id: wallet?.id,
          business_unit_id: customer?.business_unit?.id,
          prev_available_points: wallet.available_balance,
          points_balance: pointsToBurn,
        },
        customer?.id,
        true,
      );

      return {
        success: true,
        message: `MAX burn point is ${pointsToBurn} with burn amount ${discountAmount}`,
        result: {
          customer_id: customer.uuid,
          customer_phone_number: decryptedPhone,
          // from_app: 'spareit',
          transaction_id: tx.id,
          transaction_amount: tx.amount,
          max_burn_point: matchedRule.max_redeemption_points_limit,
          max_burn_amount: discountAmount,
          redemption_factor: conversionRate,
        },
        errors: [],
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        message: 'Failed to burn transaction',
        result: null,
        errors: error.message,
      });
    }
  }

  async earnHistory(body, pageNumber, pgsize, language_code: string = 'en') {
    const { customer_id } = body;

    const page = Number(pageNumber) || 1;
    const pageSize = Number(pgsize) || 10;
    const take = pageSize;
    const skip = (page - 1) * take;

    if (!customer_id) {
      throw new NotFoundException(`Customer not found`);
    }
    const customer = await this.customerRepo.findOne({
      where: { uuid: customer_id, status: 1 },
      relations: ['tenant', 'business_unit'],
    });

    if (!customer) {
      throw new NotFoundException(`Customer not found`);
    }

    const wallet = await this.walletService.getSingleCustomerWalletInfo(
      customer.id,
      customer.business_unit.id,
    );

    if (!wallet) {
      throw new NotFoundException(`Customer wallet not configured`);
    }

    const [earnedData, total] = await this.txRepo.findAndCount({
      select: [
        'id',
        'amount',
        'point_balance',
        'description',
        'invoice_no',
        'created_at',
      ],
      where: {
        type: WalletTransactionType.EARN,
        status: WalletTransactionStatus.ACTIVE,
        wallet: { id: wallet.id },
        business_unit: { id: wallet.business_unit.id },
      },
      take,
      skip,
      order: { created_at: 'DESC' },
    });

    // remove id before returning
    const earnhistory = await Promise.all(
      earnedData.map(async ({ id, ...rest }) => {
        return {
          ...rest,
          description:
            language_code === 'ar'
              ? await this.openaiService.translateToArabic(rest.description)
              : rest.description,
        };
      }),
    );

    return {
      success: true,
      message: `Successfully fetched the data!`,
      result: {
        earnhistory,
        total,
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil(total / pageSize),
      },
      errors: [],
    };
  }

  async burnHistory(body, pageNumber, pgsize, language_code: string = 'en') {
    const { customer_id } = body;

    const page = Number(pageNumber) || 1;
    const pageSize = Number(pgsize) || 10;
    const take = pageSize;
    const skip = (page - 1) * take;
    const customer = await this.customerRepo.findOne({
      where: { uuid: customer_id, status: 1 },
      relations: ['tenant', 'business_unit'],
    });

    if (!customer) {
      throw new NotFoundException(`Customer not found`);
    }

    if (customer.status == 0) {
      throw new BadRequestException(`Customer is inactive`);
    }

    if (customer.status === 3) {
      throw new NotFoundException('Customer is deleted');
    }

    const wallet = await this.walletService.getSingleCustomerWalletInfo(
      customer.id,
      customer.business_unit.id,
    );

    if (!wallet) {
      throw new NotFoundException(`Customer wallet not configured`);
    }

    const [burnData, total] = await this.txRepo.findAndCount({
      select: [
        'id',
        'amount',
        'point_balance',
        'description',
        'invoice_no',
        'created_at',
      ],
      where: {
        type: WalletTransactionType.BURN,
        status: WalletTransactionStatus.ACTIVE,
        wallet: { id: wallet.id },
        business_unit: { id: wallet.business_unit.id },
      },
      take,
      skip,
      order: { created_at: 'DESC' },
    });

    // remove id before returning
    const burnhistory = await Promise.all(
      burnData.map(async ({ id, ...rest }) => {
        return {
          ...rest,
          description:
            language_code === 'ar'
              ? await this.openaiService.translateToArabic(rest.description)
              : rest.description,
        };
      }),
    );

    return {
      success: true,
      message: `Successfully fetched the data!`,
      result: {
        burnhistory,
        total,
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil(total / pageSize),
      },
      errors: [],
    };
  }

  // Combine earn burn transaction
  async transactionHistory(
    body,
    pageNumber,
    pageSize,
    language_code: string = 'en',
  ) {
    const { customer_id } = body;
    const page = Number(pageNumber) || 1;
    const take = pageSize;
    const skip = (page - 1) * take;

    try {
      const customer = await this.customerRepo.findOne({
        where: { uuid: customer_id, status: 1 },
        relations: ['tenant', 'business_unit'],
      });

      if (!customer) {
        throw new NotFoundException(`Customer not found`);
      }

      if (customer.status == 0) {
        throw new BadRequestException(`Customer is inactive`);
      }

      if (customer.status === 3) {
        throw new NotFoundException('Customer is deleted');
      }

      const wallet = await this.walletService.getSingleCustomerWalletInfo(
        customer.id,
        customer.business_unit.id,
      );

      if (!wallet) {
        throw new NotFoundException(`Customer wallet not configured`);
      }

      const [transactionData, total] = await this.txRepo.findAndCount({
        select: [
          'id',
          'type',
          'amount',
          'point_balance',
          'description',
          'invoice_no',
          'created_at',
        ],
        where: {
          type: In([WalletTransactionType.BURN, WalletTransactionType.EARN]),
          status: WalletTransactionStatus.ACTIVE,
          wallet: { id: wallet.id },
          business_unit: { id: wallet.business_unit.id },
        },
        take,
        skip,
      });

      // remove id before returning
      const transactionhistory = await Promise.all(
        transactionData.map(async ({ id, ...rest }) => {
          return {
            ...rest,
            description:
              language_code === 'ar'
                ? await this.openaiService.translateToArabic(rest.description)
                : rest.description,
          };
        }),
      );

      return {
        success: true,
        message: `Successfully fetched the data!`,
        result: {
          transactionhistory,
          total,
          page: Number(page),
          pageSize: Number(pageSize),
          totalPages: Math.ceil(total / pageSize),
        },
        errors: [],
      };
    } catch (error) {
      throw error;
    }
  }

  async uploadProfileImage(customer_id, buffer, bucketName, objectName) {
    const customer = await this.customerRepo.findOne({
      where: { uuid: customer_id, status: 1 },
      relations: ['tenant', 'business_unit'],
    });

    if (!customer) {
      throw new NotFoundException(`Customer not found`);
    }

    if (customer.status == 0) {
      throw new BadRequestException(`Customer is inactive`);
    }

    if (customer.status === 3) {
      throw new NotFoundException('Customer is deleted');
    }

    return await this.ociService.uploadBufferToOci(
      buffer,
      bucketName,
      objectName,
    );
  }

  async uploadVehicleImage(customerId, files) {
    const customer = await this.customerRepo.findOne({
      where: { uuid: customerId, status: 1 },
      relations: ['tenant', 'business_unit'],
    });

    if (!customer) {
      throw new NotFoundException(`Customer not found`);
    }

    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    const bucketName = process.env.OCI_BUCKET;
    const ociBaseUrl = process.env.OCI_URL;

    const uploadedFiles = await Promise.all(
      files.map(async (file) => {
        const timestamp = Date.now();
        const objectName = `uploads/${timestamp}-${file.originalname}`;

        await this.ociService.uploadBufferToOci(
          file.buffer,
          bucketName,
          objectName,
        );
        const fileUrl = `${ociBaseUrl}/${encodeURIComponent(objectName)}`;

        // Verify image via OpenAI image analysis after upload, gracefully handle errors
        let analysisResult = null;
        try {
          analysisResult = await this.openaiService.analyzeCarImage(fileUrl);
          return {
            url: fileUrl,
            isValid: analysisResult?.isValid === true,
            // Optionally include analysisResult for more detail if valid, or leave out if not required
          };
        } catch (error) {
          // If OpenAI analysis throws due to invalid image, simply return isValid: false for this image
          return {
            // url: fileUrl,
            isValid: false,
          };
        }
      }),
    );

    // Provide a top-level check to see if all are valid or not
    const allFilesValid = uploadedFiles.every((file: any) => file.isValid);

    return {
      message: allFilesValid
        ? 'Files uploaded successfully'
        : 'One or more images are not valid vehicle images',
      files: uploadedFiles,
      allFilesValid,
    };
  }
}
