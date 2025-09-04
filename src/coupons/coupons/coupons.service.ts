import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import * as dayjs from 'dayjs';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { CouponTypeService } from 'src/coupon_type/coupon_type/coupon_type.service';
import { CustomerSegment } from 'src/customer-segment/entities/customer-segment.entity';
import { CustomerService } from 'src/customers/customer.service';
import { CustomerActivity } from 'src/customers/entities/customer-activity.entity';
import { Customer } from 'src/customers/entities/customer.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { TiersService } from 'src/tiers/tiers/tiers.service';
import { User } from 'src/users/entities/user.entity';
import {
  CouponStatus,
  UserCoupon,
} from 'src/wallet/entities/user-coupon.entity';
import { WalletService } from 'src/wallet/wallet/wallet.service';
import {
  DataSource,
  ILike,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Not,
  Repository,
} from 'typeorm';
import { CreateCouponDto } from '../dto/create-coupon.dto';
import { UpdateCouponDto } from '../dto/update-coupon.dto';
import { CouponCustomerSegment } from '../entities/coupon-customer-segments.entity';
import { Coupon } from '../entities/coupon.entity';
import { Campaign } from 'src/campaigns/entities/campaign.entity';
import { CampaignCustomerSegment } from 'src/campaigns/entities/campaign-customer-segments.entity';
import { CustomerSegmentMember } from 'src/customer-segment/entities/customer-segment-member.entity';
import { CampaignCoupons } from 'src/campaigns/entities/campaign-coupon.entity';
import { WalletOrder } from 'src/wallet/entities/wallet-order.entity';
import { WalletSettings } from 'src/wallet/entities/wallet-settings.entity';
import {
  WalletTransaction,
  WalletTransactionStatus,
  WalletTransactionType,
} from 'src/wallet/entities/wallet-transaction.entity';
import { OciService } from 'src/oci/oci.service';
import { CustomerCoupon } from 'src/customers/entities/customer-coupon.entity';

@Injectable()
export class CouponsService {
  constructor(
    @InjectRepository(Coupon)
    private couponsRepository: Repository<Coupon>,

    @InjectRepository(BusinessUnit)
    private businessUnitRepository: Repository<BusinessUnit>,

    @InjectRepository(User)
    private userRepository: Repository<User>,

    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,

    @InjectRepository(CouponCustomerSegment)
    private couponSegmentRepository: Repository<CouponCustomerSegment>,

    @InjectRepository(CustomerSegment)
    private segmentRepository: Repository<CustomerSegment>,

    @InjectDataSource()
    private readonly dataSource: DataSource,

    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,

    @InjectRepository(CustomerActivity)
    private readonly customeractivityRepo: Repository<CustomerActivity>,

    @InjectRepository(UserCoupon)
    private userCouponRepo: Repository<UserCoupon>,

    @InjectRepository(Coupon)
    private readonly couponRepo: Repository<Coupon>,

    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,

    @InjectRepository(CampaignCustomerSegment)
    private readonly campaignCustomerSegmentRepo: Repository<CampaignCustomerSegment>,

    @InjectRepository(CustomerSegmentMember)
    private readonly customerSegmentMemberRepository: Repository<CustomerSegmentMember>,

    @InjectRepository(CampaignCoupons)
    private readonly campaignCouponRepo: Repository<CampaignCoupons>,

    @InjectRepository(WalletSettings)
    private walletSettingsRepo: Repository<WalletSettings>,

    @InjectRepository(WalletOrder)
    private WalletOrderrepo: Repository<WalletOrder>,

    @InjectRepository(WalletTransaction)
    private txRepo: Repository<WalletTransaction>,

    private readonly couponTypeService: CouponTypeService,
    private readonly tiersService: TiersService,
    private readonly walletService: WalletService,
    private readonly customerService: CustomerService,
    private readonly ociService: OciService,

    @InjectRepository(CustomerCoupon)
    private customerCouponRepo: Repository<CustomerCoupon>,
  ) {}

  async create(dto: CreateCouponDto, user: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      queryRunner.data = { user };
      const repo = queryRunner.manager.getRepository(Coupon);
      const coupon = repo.create(dto);
      const savedCoupon = await repo.save(coupon);

      // Assign customer segments
      if (dto.customer_segment_ids?.length) {
        const segments = await this.segmentRepository.findBy({
          id: In(dto.customer_segment_ids),
        });

        if (segments.length !== dto.customer_segment_ids.length) {
          throw new BadRequestException('Some customer segments not found');
        }

        const couponSegmentEntities = segments.map((segment) =>
          this.couponSegmentRepository.create({
            coupon: savedCoupon,
            segment,
          }),
        );

        await queryRunner.manager.save(
          CouponCustomerSegment,
          couponSegmentEntities,
        );

        // Fetch all customers that belong to the given customer segments
        const customerFromSegments =
          await this.customerSegmentMemberRepository.find({
            where: {
              segment_id: In(dto.customer_segment_ids),
            },
          });

        if (customerFromSegments.length) {
          const customerCoupons: CustomerCoupon[] = [];
          // Loop through each customer that belongs to the segments
          for (let index = 0; index < customerFromSegments.length; index++) {
            const eachCustomer = customerFromSegments[index];

            // Ensure the customer exists in the customer table
            const customer = await this.customerRepo.findOne({
              where: { id: eachCustomer.customer_id },
            });

            // Skip if the customer does not exist
            if (!customer) {
              continue;
            }
            const customerCoupon = this.customerCouponRepo.create({
              customer: { id: customer.id },
              coupon: { id: savedCoupon.id },
            });
            customerCoupons.push(customerCoupon);
          }

          // Save all the created customerCoupons in one go (bulk insert)
          if (customerCoupons.length) {
            await queryRunner.manager.save(CustomerCoupon, customerCoupons);
          }
        }
      }
      await queryRunner.commitTransaction();

      return savedCoupon;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(
    client_id: number,
    name: string,
    limit: number,
    userId: number,
  ) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found against user-token');
    }

    const privileges: any[] = user.user_privileges || [];

    const tenant = await this.tenantRepository.findOne({
      where: { id: client_id },
    });
    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    const tenantName = tenant.name;

    const isSuperAdmin = privileges.some((p: any) => p.name === 'all_tenants');

    const hasGlobalAccess = privileges.some(
      (p) =>
        p.module === 'businessUnits' &&
        p.name === `${tenantName}_All Business Unit`,
    );

    const baseConditions = { status: Not(2), tenant_id: client_id };
    let whereClause = {};

    if (hasGlobalAccess || isSuperAdmin) {
      whereClause = name
        ? [
            { ...baseConditions, code: ILike(`%${name}%`) },
            { ...baseConditions, coupon_title: ILike(`%${name}%`) },
          ]
        : [baseConditions];
    } else {
      const accessibleBusinessUnitNames = privileges
        .filter(
          (p) =>
            p.module === 'businessUnits' &&
            p.name.startsWith(`${tenantName}_`) &&
            p.name !== `${tenantName}_All Business Unit`,
        )
        .map((p) => p.name.replace(`${tenantName}_`, ''));

      if (!accessibleBusinessUnitNames.length) return [];

      const businessUnits = await this.businessUnitRepository.find({
        where: {
          status: 1,
          tenant_id: client_id,
          name: In(accessibleBusinessUnitNames),
        },
      });

      const availableBusinessUnitIds = businessUnits.map((unit) => unit.id);

      const specificCoupons = await this.couponsRepository.find({
        where: { ...whereClause, business_unit: In(availableBusinessUnitIds) },
        relations: { business_unit: true },
        order: { created_at: 'DESC' },
        ...(name && { take: 20 }),
        ...(limit && { take: limit }),
      });

      return { coupons: specificCoupons };
    }

    const coupons = await this.couponsRepository.find({
      where: whereClause,
      relations: [
        'business_unit',
        'customerSegments',
        'customerSegments.segment',
      ],
      order: { created_at: 'DESC' },
      ...(name && { take: 20 }),
      ...(limit && { take: limit }),
    });

    return { coupons: coupons };
  }

  async findAllThirdParty(tenant_id: string, name: string, limit: number) {
    const baseConditions = { status: Not(2), tenant_id: tenant_id };
    let whereClause = {};

    whereClause = name
      ? [
          { ...baseConditions, code: ILike(`%${name}%`) },
          { ...baseConditions, coupon_title: ILike(`%${name}%`) },
        ]
      : [baseConditions];

    const coupons = await this.couponsRepository.find({
      where: whereClause,
      relations: [
        'business_unit',
        'customerSegments',
        'customerSegments.segment',
      ],
      order: { created_at: 'DESC' },
      ...(name && { take: 20 }),
      ...(limit && { take: limit }),
    });

    function omitCritical(obj: any, extraOmit: string[] = []): any {
      if (Array.isArray(obj)) {
        return obj.map((item) => omitCritical(item, extraOmit));
      }

      if (obj !== null && typeof obj === 'object') {
        const omitFields = new Set([
          'id',
          'tenant_id',
          'created_at',
          'updated_at',
          'created_by',
          'updated_by',
          'errors',
          ...extraOmit,
        ]);

        const cleanedObj: Record<string, any> = {};

        for (const [key, value] of Object.entries(obj)) {
          if (!omitFields.has(key)) {
            cleanedObj[key] = omitCritical(value, extraOmit);
          }
        }

        return cleanedObj;
      }

      return obj; // Return primitive values as-is
    }

    return omitCritical(coupons);
  }

  async findOne(id: number) {
    const coupon = await this.couponsRepository.findOne({
      where: { id },
      relations: [
        'business_unit',
        'customerSegments',
        'customerSegments.segment',
      ],
      order: { created_at: 'DESC' },
    });

    if (!coupon) throw new NotFoundException('Coupon not found');

    const benefits = coupon.benefits;
    return { ...coupon, benefits };
  }

  async update(id: number, dto: UpdateCouponDto, user: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      queryRunner.data = { user };
      const repo = queryRunner.manager.getRepository(Coupon);
      const coupon = await repo.findOne({ where: { id } });

      if (!coupon) throw new Error(`Coupon with id ${id} not found`);

      coupon.benefits = dto.benefits;
      repo.merge(coupon, dto);
      await repo.save(coupon); // ✅ This triggers audit events and updates

      // === CUSTOMER SEGMENTS SYNC ===
      const incomingSegmentIds = dto.customer_segment_ids || [];

      const existingRelations = await this.couponSegmentRepository.find({
        where: { coupon: { id } },
        relations: ['segment'],
      });

      const existingIds = existingRelations.map((r) => r.segment.id);

      const toAdd = incomingSegmentIds.filter(
        (sid) => !existingIds.includes(sid),
      );
      const toRemove = existingIds.filter(
        (sid) => !incomingSegmentIds.includes(sid),
      );

      if (toRemove.length) {
        await queryRunner.manager.delete(CouponCustomerSegment, {
          coupon: { id },
          segment: In(toRemove),
        });
      }

      if (toAdd.length) {
        const segments = await this.segmentRepository.findBy({ id: In(toAdd) });

        if (segments.length !== toAdd.length) {
          throw new BadRequestException('Some customer segments not found');
        }

        const newLinks = segments.map((segment) =>
          this.couponSegmentRepository.create({
            coupon,
            segment,
          }),
        );

        await queryRunner.manager.save(CouponCustomerSegment, newLinks);

        // Fetch all customers that belong to the given customer segments
        const customerFromSegments =
          await this.customerSegmentMemberRepository.find({
            where: {
              segment_id: In(toAdd),
            },
          });

        if (customerFromSegments.length) {
          const customerCoupons: CustomerCoupon[] = [];
          // Loop through each customer that belongs to the segments
          for (let index = 0; index < customerFromSegments.length; index++) {
            const eachCustomer = customerFromSegments[index];

            // Ensure the customer exists in the customer table
            const customer = await this.customerRepo.findOne({
              where: { id: eachCustomer.customer_id },
            });

            // Skip if the customer does not exist
            if (!customer) {
              continue;
            }
            const customerCoupon = this.customerCouponRepo.create({
              customer: { id: customer.id },
              coupon: { id: id },
            });
            customerCoupons.push(customerCoupon);
          }

          // Save all the created customerCoupons in one go (bulk insert)
          if (customerCoupons.length) {
            await queryRunner.manager.save(CustomerCoupon, customerCoupons);
          }
        }
      }
      await queryRunner.commitTransaction();

      return await this.findOne(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(id: number, user: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      queryRunner.data = { user };
      const repo = queryRunner.manager.getRepository(Coupon);
      const coupon = await repo.findOne({ where: { id } });

      if (!coupon) throw new Error(`Coupon with id ${id} not found`);

      coupon.status = 2;
      await repo.save(coupon);

      await queryRunner.commitTransaction();
      return { message: 'Deleted successfully' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findMakes() {
    try {
      const response = await axios.get(
        'https://cs.gogomotor.com/backend-api/master-data/makes?languageId=1',
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async findModels(makeId, year) {
    try {
      const response = await axios.get(
        `https://cs.gogomotor.com/backend-api/master-data/${makeId}/models?languageId=1`,
      );
      const filteredData = response.data.data.filter(
        (singleobj) => singleobj.ModelYear === year,
      );
      return {
        success: response.data.success,
        data: filteredData,
      };
    } catch (error) {
      throw error;
    }
  }

  async findVariants(modelId) {
    try {
      const response = await axios.get(
        `https://cs.gogomotor.com/backend-api/master-data/models/${modelId}/trims`,
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async checkExistingCode(code: string) {
    const coupon = await this.couponsRepository.findOne({
      where: { code },
    });

    if (!coupon) {
      return {
        success: false,
        message: 'code does not exists',
      };
    }

    return {
      success: true,
      message: 'This code already exists',
    };
  }

  async redeem(bodyPayload) {
    const { customer_id, campaign_id, metadata, order } = bodyPayload;
    const amount = metadata.products.reduce(
      (sum, product) => sum + product.amount,
      0,
    );

    const today = new Date();

    // Step 1: Get Customer & Wallet Info
    const customer = await this.customerRepo.findOne({
      where: { uuid: customer_id },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    if (customer && customer.status === 0) {
      throw new NotFoundException('Customer is inactive');
    }

    const wallet = await this.walletService.getSingleCustomerWalletInfoById(
      customer.id,
    );
    if (!wallet) throw new NotFoundException('Wallet not found');
    const customerId = wallet.customer.id;

    let coupon;
    let campaign;
    let hasSegments = [];

    // Step 2:
    // If campaign_id present it means coupon will be redeemed through campaign
    //other wise, it means user want to redeem coupon direclty
    if (campaign_id) {
      campaign = await this.campaignRepository.findOne({
        where: {
          uuid: campaign_id,
          status: 1,
          start_date: LessThanOrEqual(today),
          end_date: MoreThanOrEqual(today),
        },
        relations: [
          'rules',
          'rules.rule',
          'tiers',
          'tiers.tier',
          'business_unit',
          'coupons',
          'customerSegments',
          'customerSegments.segment',
        ],
      });

      if (campaign) {
        const campaignId = campaign.id;

        // Segment validation
        hasSegments = await this.campaignCustomerSegmentRepo.find({
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
            await this.tiersService.getCurrentCustomerTier(customerId);
          const matchedTier = campaignTiers.find((ct) => {
            return (
              ct.tier &&
              currentCustomerTier?.tier &&
              ct.tier.name === currentCustomerTier.tier.name &&
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
              code: metadata.coupon_code,
            },
          },
          relations: ['coupon'],
        });

        // Coupon Not Found
        if (!campaignCoupon) {
          throw new BadRequestException('Coupon not found');
        }
        coupon = campaignCoupon.coupon;
      } else {
        throw new NotFoundException(
          'Campaign not found or it may not started yet',
        );
      }
    } else {
      coupon = await this.couponsRepository.findOne({
        where: { code: metadata.coupon_code },
      });
      if (!coupon) throw new NotFoundException('Coupon not found');

      // Segment validation
      hasSegments = await this.couponSegmentRepository.find({
        where: { coupon: { id: coupon.id } },
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
            'Customer is not eligible for this coupon',
          );
        }
      }
    }

    // Checking customer is assigned to this coupon or not
    if (hasSegments.length === 0) {
      const isCustomerAssignedTothisCoupon =
        await this.customerCouponRepo.findOne({
          where: {
            customer: { id: customer.id },
            coupon: { id: coupon.id },
          },
        });

      if (!isCustomerAssignedTothisCoupon) {
        throw new NotFoundException('Customer is not eligible for this coupon');
      }
    }

    // Step 3:
    // checking coupon validation like (usage limit, expiry, max usage per user .....)
    await this.couponValidations(coupon, today, customerId);

    // Step 4:
    // checking conditions of Complex Coupon & Normal Coupon
    if (coupon?.coupon_type_id === null) {
      const conditions = coupon?.complex_coupon;
      const result = await this.checkComplexCouponConditions(
        metadata,
        conditions,
        wallet,
      );
      if (!result) {
        throw new BadRequestException('Coupon is not applicable');
      }
    } else {
      const couponType = await this.couponTypeService.findOne(
        coupon?.coupon_type_id,
      );

      const result = await this.checkSimpleCouponConditions(
        metadata,
        coupon.conditions,
        couponType,
        wallet,
      );

      if (!result) {
        throw new BadRequestException('Coupon is not applicable');
      }
    }

    // Step 5:
    // Checking if coupon already rewarded or not
    await this.checkAlreadyRewaredCoupons(
      wallet.customer.uuid,
      coupon.uuid,
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
      wallet,
      amount: earnPoints,
      sourceType: 'coupon',
      description: `Redeemed ${earnPoints} amount (${coupon.coupon_title})`,
      validityAfterAssignment: coupon.validity_after_assignment,
      order,
    });

    await this.customerService.createCustomerActivity({
      customer_uuid: wallet.customer.uuid,
      activity_type: 'coupon',
      campaign_uuid: campaign?.uuid ? campaign?.uuid : null,
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

  matchConditions(couponConditions, customer) {
    return couponConditions.some((condition) => {
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

        default:
          return false;
      }
    });
  }

  async couponValidations(coupon, today, customerId) {
    // Check From Date
    if (coupon.date_from && today < coupon.date_from) {
      throw new BadRequestException('Coupon is not yet valid');
    }

    // Coupon is expried
    if (coupon.date_to && coupon.date_to < today && coupon?.status === 0) {
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

      if (today < nextAvailable) {
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
        coupon.errors?.general_error_message_en || 'Coupon usage limit reached';
      const errMsgAr =
        coupon.errors?.general_error_message_ar ||
        'تم الوصول إلى الحد الأقصى لاستخدام القسيمة';

      throw new BadRequestException(`${errMsgEn} / ${errMsgAr}`);
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

  async creditWallet({
    wallet,
    amount,
    sourceType,
    description,
    validityAfterAssignment,
    order,
  }: {
    wallet: any;
    amount: number;
    sourceType: string;
    description: string;
    validityAfterAssignment?: number;
    order;
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

  async checkSimpleCouponConditions(metadata, conditions, couponType, wallet) {
    switch (couponType.coupon_type) {
      case 'VEHICLE_SPECIFIC': {
        if (!metadata.vehicle || metadata.vehicle.length === 0) return false;
        return metadata.vehicle.some((veh: any) =>
          conditions.some((cond: any) => {
            const fieldName = cond.type;
            const vehValue = veh[fieldName];

            if (vehValue === undefined) return false;
            const vehicleExtraFeatures = this.applyOperator(
              String(vehValue).toLowerCase(),
              cond.operator,
              String(cond.value).toLowerCase(),
            );

            // Make check (if provided in condition)
            const makeMatch = cond.make_name
              ? veh.make?.toLowerCase() === cond.make_name.toLowerCase()
              : false;

            //  Year check (if provided)
            const yearMatch = cond.year ? veh.year === cond.year : false;

            // Model check
            const modelMatch = cond.model_name
              ? veh.model?.toLowerCase() === cond.model_name.toLowerCase()
              : false;

            let variantMatch = false;
            // Variant check (if provided, match against array of allowed variants)
            if (cond.variant.length == 1 && cond.variant[0] === 'all') {
              variantMatch = true;
            } else {
              variantMatch =
                cond.variant_names && cond.variant_names.length > 0
                  ? cond.variant_names.some(
                      (v: string) =>
                        v.toLowerCase() === veh.variant?.toLowerCase(),
                    )
                  : false;
            }

            return (
              (vehicleExtraFeatures && makeMatch) ||
              yearMatch ||
              modelMatch ||
              variantMatch
            );
          }),
        );
      }

      case 'USER_SPECIFIC': {
        const decryptedEmail = await this.ociService.decryptData(
          wallet.customer.email,
        );
        const decryptedPhone = await this.ociService.decryptData(
          wallet.customer.phone,
        );

        const isApplicableForUser = await this.matchConditions(conditions, {
          email: decryptedEmail,
          phone_number: decryptedPhone,
        });

        return isApplicableForUser ? true : false;
      }

      case 'PRODUCT_SPECIFIC': {
        if (!metadata.products || metadata.products.length === 0) return false;
        return metadata.products.some((product: any) =>
          conditions.some((cond: any) => product.name === cond.type),
        );
      }

      case 'GEO_TARGETED': {
        const city = wallet.customer.city?.toLowerCase() || '';
        const address = wallet.customer.address?.toLowerCase() || '';
        const isEligible = conditions.every((condition) => {
          const inputValue = condition.type?.toLowerCase() || '';

          let isMatch = false;
          const values = inputValue.split(',').map((v) => v.trim());
          const includes = values.filter((v) => !v.startsWith('!='));
          const excludes = values
            .filter((v) => v.startsWith('!='))
            .map((v) => v.replace('!=', '').trim());

          // Check "includes"
          if (includes.length > 0) {
            isMatch = includes.some((v) => city === v || address.includes(v));
          }

          // Check "excludes"
          if (excludes.length > 0) {
            const excluded = excludes.some(
              (v) => city === v || address.includes(v),
            );
            if (excluded) {
              isMatch = false; // ❌ override if excluded
            }
          }

          return isMatch;
        });
        return isEligible;
      }

      case 'SERVICE_BASED': {
        if (!metadata.services) return false;
        return conditions.some((cond) => {
          const service = metadata.services.find(
            (s: any) => s.name.toLowerCase() === cond.type.toLowerCase(),
          );

          if (!service) return false;
          return this.applyOperator(service.value, cond.operator!, cond.value);
        });
      }

      case 'DISCOUNT': {
        // It means admin diretly want to give discount to customer without and rule/condition
        if (
          conditions.length == 1 &&
          conditions[0].type == '' &&
          conditions[0].operator == '' &&
          conditions[0].value == ''
        ) {
          return true;
        }

        if (!metadata.products || metadata.products.length === 0) return false;
        const totalAmount = metadata.products.reduce(
          (sum, product) => sum + product.amount,
          0,
        );

        return conditions.every((cond) => {
          const value = Number(cond.value);
          return this.applyOperator(totalAmount, cond.operator, value);
        });
      }

      case 'TIER_BASED': {
        const customerTierInfo = await this.tiersService.getCurrentCustomerTier(
          wallet.customer.id,
        );

        const cutomerFallInTier = conditions.find(
          (singleTier) => singleTier.tier === customerTierInfo.tier.id,
        );

        return cutomerFallInTier ? true : false;
      }

      case 'BIRTHDAY': {
        const today = new Date();
        const dob = new Date(wallet.customer.DOB);
        const isBirthday =
          today.getDate() === dob.getDate() &&
          today.getMonth() === dob.getMonth();

        return isBirthday ? true : false;
      }

      case 'REFERRAL':
        if (!metadata.referral) return false;
        const totalAmount = metadata.products.reduce(
          (sum, product) => sum + product.amount,
          0,
        );
        return conditions.some((cond) => {
          const value = Number(cond.value);
          return this.applyOperator(totalAmount, cond.operator, value);
        });

      default:
        return false;
    }
  }

  async checkComplexCouponConditions(metadata, conditions, wallet) {
    const results: boolean[] = [];
    for (const condition of conditions) {
      const couponType = condition.selectedCouponType;
      const conditions = condition.dynamicRows || [];

      switch (couponType) {
        case 'VEHICLE_SPECIFIC': {
          if (!metadata.vehicle || metadata.vehicle.length === 0) {
            results.push(false);
            break;
          }

          const isVehicleSatisfied = metadata.vehicle.some((veh: any) =>
            conditions.some((cond: any) => {
              const fieldName = cond.type;
              const vehValue = veh[fieldName];

              if (vehValue === undefined) return false;
              const vehicleExtraFeatures = this.applyOperator(
                String(vehValue).toLowerCase(),
                cond.operator,
                String(cond.value).toLowerCase(),
              );

              // Make check (if provided in condition)
              const makeMatch = cond.make_name
                ? veh.make?.toLowerCase() === cond.make_name.toLowerCase()
                : false;

              //  Year check (if provided)
              const yearMatch = cond.year ? veh.year === cond.year : false;

              // Model check
              const modelMatch = cond.model_name
                ? veh.model?.toLowerCase() === cond.model_name.toLowerCase()
                : false;

              let variantMatch = false;
              // Variant check (if provided, match against array of allowed variants)
              if (cond.variant.length == 1 && cond.variant[0] === 'all') {
                variantMatch = true;
              } else {
                variantMatch =
                  cond.variant_names && cond.variant_names.length > 0
                    ? cond.variant_names.some(
                        (v: string) =>
                          v.toLowerCase() === veh.variant?.toLowerCase(),
                      )
                    : false;
              }

              return (
                (vehicleExtraFeatures && makeMatch) ||
                yearMatch ||
                modelMatch ||
                variantMatch
              );
            }),
          );

          results.push(isVehicleSatisfied);
          break;
        }

        case 'USER_SPECIFIC': {
          const decryptedEmail = await this.ociService.decryptData(
            wallet.customer.email,
          );
          const decryptedPhone = await this.ociService.decryptData(
            wallet.customer.phone,
          );

          const isApplicableForUser = await this.matchConditions(conditions, {
            email: decryptedEmail,
            phone_number: decryptedPhone,
          });

          results.push(isApplicableForUser);
          break;
        }

        case 'PRODUCT_SPECIFIC': {
          if (!metadata.products || metadata.products.length === 0) {
            results.push(false);
            break;
          }
          const hasProduct = metadata?.products?.some((product) =>
            conditions.some((cond: any) => product.name === cond.type),
          );
          results.push(hasProduct);
          break;
        }

        case 'GEO_TARGETED': {
          const city = wallet.customer.city?.toLowerCase() || '';
          const address = wallet.customer.address?.toLowerCase() || '';
          const isEligible = conditions.every((condition) => {
            const inputValue = condition.type?.toLowerCase() || '';

            let isMatch = false;
            const values = inputValue.split(',').map((v) => v.trim());
            const includes = values.filter((v) => !v.startsWith('!='));
            const excludes = values
              .filter((v) => v.startsWith('!='))
              .map((v) => v.replace('!=', '').trim());

            // Check "includes"
            if (includes.length > 0) {
              isMatch = includes.some((v) => city === v || address.includes(v));
            }

            // Check "excludes"
            if (excludes.length > 0) {
              const excluded = excludes.some(
                (v) => city === v || address.includes(v),
              );
              if (excluded) {
                isMatch = false; // ❌ override if excluded
              }
            }

            return isMatch;
          });
          results.push(isEligible);
          break;
        }

        case 'SERVICE_BASED': {
          if (!metadata.services || metadata.services.length === 0) {
            results.push(false);
            break;
          }
          const isServiceSatisfied = conditions.some((cond) => {
            const service = metadata.services.find(
              (s: any) => s.name.toLowerCase() === cond.type.toLowerCase(),
            );

            if (!service) return false;
            return this.applyOperator(
              service.value,
              cond.operator!,
              cond.value,
            );
          });

          results.push(isServiceSatisfied);
          break;
        }

        case 'DISCOUNT': {
          if (!metadata.products || metadata.products.length === 0) {
            results.push(false);
            break;
          }
          const totalAmount = metadata.products.reduce(
            (sum, product) => sum + product.amount,
            0,
          );

          const isdiscountapplicable = conditions.every((cond) => {
            const value = Number(cond.value);
            return this.applyOperator(totalAmount, cond.operator, value);
          });

          results.push(isdiscountapplicable);
          break;
        }

        case 'TIER_BASED': {
          if (!metadata.products || metadata.products.length === 0) {
            results.push(false);
            break;
          }
          const customerTierInfo =
            await this.tiersService.getCurrentCustomerTier(wallet.customer.id);

          const cutomerFallInTier = conditions.find(
            (singleTier) => singleTier.tier === customerTierInfo.tier.id,
          );
          const iscustomerTierSatisfied = cutomerFallInTier ? true : false;
          results.push(iscustomerTierSatisfied);
          break;
        }

        case 'BIRTHDAY': {
          const today = new Date();
          const dob = new Date(wallet.customer.DOB);
          const isBirthday =
            today.getDate() === dob.getDate() &&
            today.getMonth() === dob.getMonth();

          results.push(isBirthday);
          break;
        }

        case 'REFERRAL': {
          if (!metadata.referral) {
            results.push(false);
            break;
          }

          const totalAmount = metadata.products.reduce(
            (sum, product) => sum + product.amount,
            0,
          );

          const isReferalSatisfied = conditions.some((cond) => {
            const value = Number(cond.value);
            return this.applyOperator(totalAmount, cond.operator, value);
          });

          results.push(isReferalSatisfied);
          break;
        }

        default:
          results.push(false);
          break;
      }
    }

    return results.every(Boolean);
  }

  applyOperator(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case '==':
        return actual === expected;
      case '!=':
        return actual !== expected;
      case '>=':
        return actual >= expected;
      case '<=':
        return actual <= expected;
      case '>':
        return actual > expected;
      case '<':
        return actual < expected;
      case 'IN':
        return Array.isArray(expected) && expected.includes(actual);
      default:
        return false;
    }
  }

  async earnCoupon(bodyPayload: any) {
    const { customer_id, order, BUId, metadata, tenantId } = bodyPayload;

    // 1. Find customer by uuid
    const customer = await this.customerRepo.findOne({
      where: {
        uuid: customer_id,
        business_unit: { id: parseInt(BUId) },
        tenant: { id: tenantId },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    // 2. Get customer wallet info
    const wallet = await this.walletService.getSingleCustomerWalletInfoById(
      customer.id,
    );
    if (!wallet) throw new NotFoundException('Wallet not found');

    let walletOrderRes;
    if (order) {
      if (order && typeof order === 'object' && order.amount !== undefined) {
        const walletOrder: Partial<WalletOrder> = {
          wallet: wallet,
          business_unit: wallet.business_unit,
          amount: order.amount,
          metadata: order,
          discount: 0,
          subtotal: order.amount,
        };

        walletOrderRes = await this.WalletOrderrepo.save(walletOrder);
      }
    }

    if (metadata?.productitems.products?.length) {
      let totalAmount = 0;
      for (
        let index = 0;
        index <= metadata?.productitems?.products.length - 1;
        index++
      ) {
        const eachProduct = metadata?.productitems?.products[index];
        if (eachProduct.amount) {
          const walletTransaction: Partial<WalletTransaction> = {
            wallet: wallet,
            orders: walletOrderRes,
            business_unit: wallet.business_unit,
            type: WalletTransactionType.ORDER,
            source_type: eachProduct.name,
            amount: eachProduct.amount,
            status: WalletTransactionStatus.ACTIVE,
            description: `Customer placed a new order.`,
          };

          const transaction = await this.txRepo.save(walletTransaction);
          totalAmount += transaction.amount;

          const coupons = await this.couponRepo.find({
            where: { status: 1, tenant_id: tenantId, business_unit_id: BUId },
          });

          if (coupons.length) {
            const matchedCoupons = coupons.filter(async (coupon) => {
              const couponType = await this.couponTypeService.findOne(
                coupon?.coupon_type_id,
              );

              if (
                couponType.coupon_type === 'GEO_TARGETED' ||
                couponType.coupon_type === 'USER_SPECIFIC'
              ) {
                return coupon;
              }

              const inConditions = coupon.conditions?.some(
                (c: any) =>
                  (!c.type && !c.value) ||
                  c.tier !== '' ||
                  c.type === eachProduct.name,
              );

              const inComplex = coupon.complex_coupon?.some((cc: any) =>
                cc.dynamicRows?.some((dr: any) => dr.type === eachProduct.name),
              );

              return inConditions || inComplex;
            });

            for (let index = 0; index <= matchedCoupons.length - 1; index++) {
              const eachMatchedCoupon = matchedCoupons[index];

              const isAlreadyAssigned = await this.customerCouponRepo.findOne({
                where: {
                  customer: { id: customer.id },
                  coupon: { id: eachMatchedCoupon.id },
                },
              });

              if (!isAlreadyAssigned) {
                await this.customerCouponRepo.save({
                  customer: { id: customer.id },
                  coupon: { id: eachMatchedCoupon.id },
                });
              }
            }
          }
        }
      }
      return {
        message: 'Coupon earned successfully',
        amount: totalAmount,
      };
    }
  }

  async getCustomerCoupons(body) {
    const { customerId, bUId } = body;
    const customer = await this.customerRepo.findOne({
      where: { uuid: customerId, business_unit: { id: parseInt(bUId) } },
    });

    if (!customer) throw new NotFoundException('Customer not found');
    if (customer && customer.status == 0) {
      throw new NotFoundException('Customer is inactive');
    }

    const customerCoupons = await this.customerCouponRepo.find({
      where: {
        customer: { id: customer.id },
      },
      relations: ['coupon'],
    });

    const available = [];
    const expired = [];
    const today = new Date();
    if (customerCoupons.length) {
      for (let index = 0; index <= customerCoupons.length - 1; index++) {
        const eachCoupon = customerCoupons[index].coupon;
        // Coupon is expried
        if (
          eachCoupon.date_to &&
          eachCoupon.date_to < today &&
          eachCoupon?.status === 0
        ) {
          expired.push({
            uuid: eachCoupon.uuid,
            code: eachCoupon.code,
            title: eachCoupon.coupon_title,
            title_ar: eachCoupon.coupon_title_ar,
            expiry_date: eachCoupon.date_to,
          });
        }

        available.push({
          uuid: eachCoupon.uuid,
          code: eachCoupon.code,
          title: eachCoupon.coupon_title,
          title_ar: eachCoupon.coupon_title_ar,
          expiry_date: eachCoupon.date_to,
        });
      }
    }

    return {
      success: true,
      message: 'Successfully fetched the data!',
      result: {
        available,
        expired,
      },
      errors: [],
    };
  }
}
