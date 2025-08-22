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
    const { amount } = order ?? {};
    const today = new Date();

    // Step 1: Get Customer & Wallet Info
    const customer = await this.customerRepo.findOne({
      where: { uuid: customer_id },
    });
    if (!customer) throw new NotFoundException('Customer not found 777');

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
              uuid: metadata.uuid,
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
        where: { uuid: metadata.uuid },
      });
      if (!coupon) throw new NotFoundException('Coupon not found');
    }

    // Step 3:
    // checking coupon validation like (usage limit, expiry, max usage per user .....)
    await this.couponValidations(coupon, today, customerId);

    // Step 4:
    // checking conditions of Complex Coupon & Normal Coupon
    if (coupon?.coupon_type_id === null) {
      const conditions = coupon?.complex_coupon;
      const result = await this.checkComplexCouponConditions(
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
        const customerTierInfo = await this.tiersService.getCurrentCustomerTier(
          wallet.customer.id,
        );

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
          throw new BadRequestException("you're not eligible for this coupon");
        }
      } else if (
        couponType.coupon_type === 'DISCOUNT' &&
        coupon.conditions == null
      ) {
        // Do nothing it means directly want to give coupon without condtions
      } else {
        const result = this.checkSimpleCouponConditions(
          metadata,
          coupon.conditions,
          couponType,
        );
        if (!result.valid) {
          throw new BadRequestException(result.message);
        }
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

  async checkComplexCouponConditions(
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

  checkSimpleCouponConditions(userCouponInfo, dbCouponInfo, couponType) {
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
}
