import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
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
  Not,
  Repository,
} from 'typeorm';
import { CreateCouponDto } from '../dto/create-coupon.dto';
import { UpdateCouponDto } from '../dto/update-coupon.dto';
import { CouponCustomerSegment } from '../entities/coupon-customer-segments.entity';
import { Coupon } from '../entities/coupon.entity';

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

    private readonly couponTypeService: CouponTypeService,
    private readonly tiersService: TiersService,
    private readonly walletService: WalletService,
    private readonly customerService: CustomerService,
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

    return coupon;
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

  async redeemCoupon(bodyPayload) {
    const { customer_id, coupon_info, order } = bodyPayload;
    const { amount } = order ?? {};

    // Step 1: Get Customer & Wallet Info
    const customer = await this.customerRepo.findOne({
      where: { uuid: customer_id },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const wallet = await this.walletService.getSingleCustomerWalletInfoById(
      customer.id,
    );
    if (!wallet) throw new NotFoundException('Customer Wallet not found');

    const couponInfo = await this.couponsRepository.findOne({
      where: { uuid: coupon_info.uuid },
    });

    if (!couponInfo) throw new NotFoundException('Coupon not found');
    const now = new Date();

    // Check From Date
    if (couponInfo.date_from && now < couponInfo.date_from) {
      throw new BadRequestException('Coupon is not yet valid');
    }

    // Coupon is expried
    if (
      couponInfo.date_to &&
      couponInfo.date_to < now &&
      couponInfo?.status === 0
    ) {
      throw new BadRequestException('This coupon has been expired!');
    }

    // Coupon is inactive
    if (couponInfo.status === 0)
      throw new BadRequestException('Coupon is not active');

    // Check reuse interval for this user
    const lastUsage = await this.userCouponRepo.findOne({
      where: {
        customer: { id: wallet.customer.id },
        coupon_code: couponInfo.code,
      },
      order: { redeemed_at: 'DESC' },
    });

    if (lastUsage && couponInfo.reuse_interval > 0) {
      const nextAvailable = new Date(lastUsage.redeemed_at);
      nextAvailable.setDate(
        nextAvailable.getDate() + couponInfo.reuse_interval,
      );

      if (now < nextAvailable) {
        throw new BadRequestException(
          `You can reuse this coupon after ${nextAvailable.toDateString()}`,
        );
      }
    }

    // Check total usage limit
    if (
      couponInfo.usage_limit &&
      couponInfo.number_of_times_used >= couponInfo.usage_limit
    ) {
      const errMsgEn =
        couponInfo.errors?.general_error_message_en ||
        'Coupon usage limit reached';
      const errMsgAr =
        couponInfo.errors?.general_error_message_ar ||
        'تم الوصول إلى الحد الأقصى لاستخدام القسيمة';

      throw new BadRequestException(`${errMsgEn} / ${errMsgAr}`);
    }

    if (
      // couponInfo?.complex_coupon && couponInfo?.complex_coupon.length >= 1
      couponInfo?.coupon_type_id === null
    ) {
      const result = await this.validateComplexCouponConditions(
        coupon_info.complex_coupon,
        couponInfo?.complex_coupon,
        customer,
        couponInfo,
      );
      if (!result.valid) {
        throw new BadRequestException(result.message);
      }
    }
    // else if (couponInfo?.conditions) {
    else {
      const couponType = await this.couponTypeService.findOne(
        couponInfo?.coupon_type_id,
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
        const cutomerFallInTier = coupon_info.conditions.find(
          (singleTier) => singleTier.tier === customerTierInfo.tier.id,
        );
        couponInfo.discount_type = 'percentage_discount';
        couponInfo.discount_price = cutomerFallInTier.value;
      } else {
        const result = this.validateSimpleCouponConditions(
          coupon_info,
          couponInfo.conditions,
          couponType,
        );
        if (!result.valid) {
          throw new BadRequestException(result.message);
        }
      }
    }

    await this.checkAlreadyRedeemCoupon(wallet.customer.uuid, coupon_info.uuid);

    if (
      couponInfo.discount_type === 'percentage_discount' &&
      (amount === undefined || amount === null || amount === '')
    ) {
      throw new BadRequestException(`Amount is required`);
    }

    const earnPoints =
      couponInfo.discount_type === 'fixed_discount'
        ? (couponInfo.discount_price ?? 0)
        : (amount * Number(couponInfo.discount_price)) / 100;

    const savedTx = await this.customerService.creditWallet({
      wallet,
      amount: earnPoints,
      sourceType: 'coupon',
      description: `Redeemed ${earnPoints} amount (${couponInfo.coupon_title})`,
      validityAfterAssignment: couponInfo.validity_after_assignment,
      order,
    });

    await this.customerService.createCustomerActivity({
      customer_uuid: wallet.customer.uuid,
      activity_type: 'coupon',
      coupon_uuid: couponInfo.uuid,
      amount: earnPoints,
    });

    // Update coupon usage
    await this.userCouponRepo.save({
      coupon_code: couponInfo.code,
      status: CouponStatus.USED,
      redeemed_at: new Date(),
      customer: { id: wallet.customer.id },
      business_unit: { id: wallet.business_unit.id },
      issued_from_type: 'coupon',
      issued_from_id: couponInfo.id,
    });

    couponInfo.number_of_times_used = Number(
      couponInfo.number_of_times_used + 1,
    );
    await this.couponRepo.save(couponInfo);

    return {
      success: true,
      amount: Number(savedTx.amount),
    };
  }

  async validateComplexCouponConditions(
    userCouponInfo,
    dbCouponInfo,
    customer,
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
        const dob = new Date(customer.DOB);
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
          customer.id,
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

  async checkAlreadyRedeemCoupon(customer_uuid, coupon_uuid) {
    const previousRewards = await this.customeractivityRepo.find({
      where: {
        customer_uuid: customer_uuid,
        coupon_uuid: coupon_uuid,
      },
    });

    if (previousRewards.length) {
      throw new BadRequestException('Already redeemed this coupon');
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

  @Cron(CronExpression.EVERY_HOUR)
  async markExpiredCoupons() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    console.log('Running coupon expiry check...');

    const expiredCoupons = await this.couponsRepository.find({
      where: { date_to: LessThanOrEqual(today), status: 1 },
    });

    for (const coupon of expiredCoupons) {
      coupon.status = 0;
      await this.couponsRepository.save(coupon);
      console.log(`Deactivated coupon: ${coupon.coupon_title}`);
    }
  }
}
