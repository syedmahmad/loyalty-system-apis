import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import * as dayjs from 'dayjs';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as fastcsv from 'fast-csv';
import * as csv from 'csv-parser';
import * as path from 'path';
// import { v4 as uuidv4 } from 'uuid';
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
import { CouponSyncLog } from '../entities/coupon-sync-logs.entity';
import { CouponUsage } from '../entities/coupon-usages.entity';
import { CouponType, CouponTypeName } from '../type/types';
import { Tier } from 'src/tiers/entities/tier.entity';
import { LanguageEntity } from 'src/master/language/entities/language.entity';
import { CouponLocaleEntity } from '../entities/coupon-locale.entity';
import { OpenAIService } from 'src/openai/openai/openai.service';
import { Readable } from 'stream';

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

    @InjectRepository(Tier)
    private tierRepo: Repository<Tier>,

    private readonly couponTypeService: CouponTypeService,
    private readonly tiersService: TiersService,
    private readonly walletService: WalletService,
    private readonly customerService: CustomerService,
    private readonly ociService: OciService,

    @InjectRepository(CouponSyncLog)
    private couponSyncLogRepo: Repository<CouponSyncLog>,

    @InjectRepository(CouponUsage)
    private couponUsageRepo: Repository<CouponUsage>,

    @InjectRepository(LanguageEntity)
    private languageRepo: Repository<LanguageEntity>,

    @InjectRepository(CouponLocaleEntity)
    private readonly couponLocaleRepo: Repository<CouponLocaleEntity>,

    private readonly openAIService: OpenAIService,
  ) {}

  async create(dto: CreateCouponDto, user: string, permissions: any) {
    const userInfo = await this.userRepository.findOne({
      where: { uuid: user },
    });

    if (!userInfo) {
      throw new BadRequestException('User not found against user-token');
    }

    // Use the guard's permission object
    const canCreateCoupons = permissions?.canCreateCoupons;

    if (!canCreateCoupons) {
      throw new ForbiddenException(
        "User doesn't have permission to create coupons",
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      queryRunner.data = { user };
      const { locales, id, ...rest } = dto;
      const coupon = this.couponRepo.create({
        ...(id && { id }),
        ...rest,
        locales: locales?.map((locale) => ({
          language: { id: locale.languageId },
          title: locale.title,
          description: locale.description,
          term_and_condition: locale.term_and_condition,
          desktop_image: locale.desktop_image,
          mobile_image: locale.mobile_image,
          general_error: locale.general_error,
          exception_error: locale.exception_error,
          benefits: locale.benefits,
        })) as any,
      });
      const savedCoupon = await this.couponRepo.save(coupon);

      // Assign customer segments
      if (dto.customer_segment_ids?.length && dto.all_users == 0) {
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
          const userCoupons: UserCoupon[] = [];

          for (let index = 0; index < customerFromSegments.length; index++) {
            const eachCustomer = customerFromSegments[index];

            const customer = await this.customerRepo.findOne({
              where: { id: eachCustomer.customer_id, status: 1 },
              relations: ['business_unit'],
            });

            if (!customer) continue;

            const userCoupon = this.userCouponRepo.create({
              coupon_code: savedCoupon.code,
              status: CouponStatus.ISSUED,
              customer: { id: customer.id },
              business_unit: { id: customer.business_unit.id },
              issued_from_type: 'coupon',
              issued_from_id: savedCoupon.id,
              coupon_id: savedCoupon?.id,
            });
            userCoupons.push(userCoupon);
          }

          if (userCoupons.length) {
            await queryRunner.manager.save(UserCoupon, userCoupons);
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

  // async findAll(
  //   client_id: number,
  //   name: string,
  //   limit: number,
  //   userId: number,
  //   business_unit_id: number,
  //   page: number = 1,
  //   pageSize: number = 10,
  // ) {
  //   const take = pageSize;
  //   const skip = (page - 1) * take;

  //   const user = await this.userRepository.findOne({ where: { id: userId } });
  //   if (!user) {
  //     throw new BadRequestException('User not found against user-token');
  //   }

  //   const privileges: any[] = user.user_privileges || [];

  //   const hasGlobalCouponAccess = privileges.some(
  //     (p: any) =>
  //       // 1. Specific tenant access
  //       (p.module === 'tenants' && p?.name !== 'all_tenants') ||
  //       // 2. Specific business unit access
  //       (p.module === 'businessUnits' &&
  //         p?.name.startsWith(`${tenantName}_`) &&
  //         p?.name !== `${tenantName}_All Business Unit`) ||
  //       // 3. Global access
  //       p?.name === 'all_tenants' ||
  //       p?.name?.includes('_All Business Unit') ||
  //       (p.module === 'coupons_module' && p?.name?.includes('view_coupons')),
  //   );

  //   if (!hasGlobalCouponAccess) {
  //     throw new ForbiddenException(
  //       "User doesn't have permission to get coupons",
  //     );
  //   }

  //   const tenant = await this.tenantRepository.findOne({
  //     where: { id: client_id },
  //   });
  //   if (!tenant) {
  //     throw new BadRequestException('Tenant not found');
  //   }

  //   const tenantName = tenant.name;

  //   const isSuperAdmin = privileges.some((p: any) => p.name === 'all_tenants');

  //   const hasGlobalAccess = privileges.some(
  //     (p) =>
  //       p.module === 'businessUnits' &&
  //       p.name === `${tenantName}_All Business Unit`,
  //   );

  //   const baseConditions = {
  //     status: Not(2),
  //     tenant_id: client_id,
  //     ...(business_unit_id &&
  //     typeof business_unit_id === 'string' &&
  //     business_unit_id !== '1'
  //       ? { business_unit_id }
  //       : {}),
  //   };
  //   let whereClause = {};

  //   if (hasGlobalAccess || isSuperAdmin) {
  //     whereClause = name
  //       ? [
  //           { ...baseConditions, code: ILike(`%${name}%`) },
  //           { ...baseConditions, coupon_title: ILike(`%${name}%`) },
  //         ]
  //       : [baseConditions];
  //   } else {
  //     const accessibleBusinessUnitNames = privileges
  //       .filter(
  //         (p) =>
  //           p.module === 'businessUnits' &&
  //           p.name.startsWith(`${tenantName}_`) &&
  //           p.name !== `${tenantName}_All Business Unit`,
  //       )
  //       .map((p) => p.name.replace(`${tenantName}_`, ''));

  //     const businessUnits = await this.businessUnitRepository.find({
  //       where: {
  //         status: 1,
  //         tenant_id: client_id,
  //         name: In(accessibleBusinessUnitNames),
  //       },
  //     });

  //     const availableBusinessUnitIds = businessUnits.map((unit) => unit.id);

  //     const [data, total] = await this.couponsRepository.findAndCount({
  //       where: {
  //         ...whereClause,
  //         ...(business_unit_id &&
  //         typeof business_unit_id === 'string' &&
  //         business_unit_id !== '1'
  //           ? { business_unit_id: business_unit_id }
  //           : { business_unit: In(availableBusinessUnitIds) }),
  //       },
  //       relations: { business_unit: true },
  //       order: { created_at: 'DESC' },
  //       take,
  //       skip,
  //     });

  //     return {
  //       data,
  //       total,
  //       page,
  //       pageSize,
  //       totalPages: Math.ceil(total / pageSize),
  //     };
  //   }

  //   const [data, total] = await this.couponsRepository.findAndCount({
  //     where: whereClause,
  //     relations: [
  //       'business_unit',
  //       'customerSegments',
  //       'customerSegments.segment',
  //     ],
  //     order: { created_at: 'DESC' },
  //     take,
  //     skip,
  //   });

  //   return {
  //     data,
  //     total,
  //     page,
  //     pageSize,
  //     totalPages: Math.ceil(total / pageSize),
  //   };
  // }

  async findAllWithPermissions(
    permissions: any,
    client_id: number,
    name?: string,
    limit?: number,
    bu?: number,
    page: number = 1,
    pageSize: number = 10,
    langCode: string = 'en',
  ) {
    const take = pageSize;
    const skip = (page - 1) * take;

    const {
      allowedTenantIds,
      allowedBusinessUnitIds,
      allowAllTenants,
      allowAllBU,
      canViewCoupons,
    } = permissions;

    if (!canViewCoupons) {
      throw new ForbiddenException(
        'User does not have permission to access the coupons',
      );
    }

    if (!allowAllTenants && !allowedTenantIds.includes(client_id)) {
      // -----------------------------------------------------
      // 1. Tenant filtering
      // -----------------------------------------------------
      throw new ForbiddenException(
        'User does not have permission to access this tenant',
      );
    }

    const baseWhere: any = {
      tenant_id: client_id,
      status: Not(2),
    };

    // -----------------------------------------------------
    // 2. Resolve Business Unit filtering
    // -----------------------------------------------------

    // Priority rule: If frontend explicitly sends BU filter → apply only if allowed
    if (bu && !isNaN(Number(bu))) {
      if (!allowAllBU && !allowedBusinessUnitIds.includes(Number(bu))) {
        throw new ForbiddenException(
          'User does not have permission for this business unit',
        );
      }

      baseWhere.business_unit_id = Number(bu);
    } else {
      // No BU filter from frontend → apply internal permissions
      if (!allowAllBU) {
        baseWhere.business_unit_id = In(allowedBusinessUnitIds);
      }
      // else allow all BUs under that tenant
    }

    // -----------------------------------------------------
    // 3. Name search
    // -----------------------------------------------------
    let where: any = baseWhere;

    if (name) {
      where = [
        { ...baseWhere, code: ILike(`%${name}%`) },
        { ...baseWhere, coupon_title: ILike(`%${name}%`) },
      ];
    }

    // -----------------------------------------------------
    // 4. Fetch results
    // -----------------------------------------------------
    const [data, total] = await this.couponsRepository.findAndCount({
      where,
      relations: [
        'business_unit',
        'customerSegments',
        'customerSegments.segment',
      ],
      order: { created_at: 'DESC' },
      take,
      skip,
    });

    // -----------------------------------------------------
    // 5. Return response format
    // -----------------------------------------------------
    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findAllThirdParty(tenant_id: string, name: string, limit: number) {
    const baseConditions = { status: Not(2), tenant_id: tenant_id };
    let whereClause = {};

    whereClause = name
      ? [{ ...baseConditions, code: ILike(`%${name}%`) }, { ...baseConditions }]
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
    return { ...coupon };
  }

  async update(
    id: number,
    dto: UpdateCouponDto,
    user: string,
    permissions: any,
  ) {
    // Use the guard's permission object
    const canEditCoupons = permissions?.canEditCoupons;

    if (!canEditCoupons) {
      throw new ForbiddenException(
        "User doesn't have permission to get coupons",
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      queryRunner.data = { user };
      const repo = queryRunner.manager.getRepository(Coupon);
      const coupon = await repo.findOne({ where: { id } });

      if (!coupon) throw new Error(`Coupon with id ${id} not found`);

      Object.assign(coupon, dto);
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

      let toRemove = existingIds.filter(
        (sid) => !incomingSegmentIds.includes(sid),
      );

      if (dto.all_users == 1 && incomingSegmentIds.length) {
        toRemove = incomingSegmentIds;
      }

      if (toRemove.length) {
        // Delete all coupon_customer_segments
        const toDelete = await queryRunner.manager.find(CouponCustomerSegment, {
          where: { coupon: { id }, segment: In(toRemove) },
        });
        if (toDelete.length) {
          await queryRunner.manager.remove(CouponCustomerSegment, toDelete);
        }

        /* Delete all user_coupon
        Fetch all customers that belong to the given customer segments */
        const customerFromSegments =
          await this.customerSegmentMemberRepository.find({
            where: {
              segment_id: In(toRemove),
            },
          });

        if (customerFromSegments.length) {
          const customerArr = [];
          // Loop through each customer that belongs to the segments
          for (let index = 0; index < customerFromSegments.length; index++) {
            const eachCustomer = customerFromSegments[index];

            // Ensure the customer exists in the customer table
            const customer = await this.customerRepo.findOne({
              where: { id: eachCustomer.customer_id, status: 1 },
              relations: ['business_unit'],
            });

            // Skip if the customer does not exist
            if (!customer) {
              continue;
            }

            customerArr.push(customer.id);
          }

          const customersToDelete = await queryRunner.manager.find(UserCoupon, {
            where: { coupon_id: id, customer: In(customerArr) },
          });

          if (customersToDelete.length) {
            await queryRunner.manager.remove(UserCoupon, customersToDelete);
          }
        }
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
          const userCoupons: UserCoupon[] = [];
          // Loop through each customer that belongs to the segments
          for (let index = 0; index < customerFromSegments.length; index++) {
            const eachCustomer = customerFromSegments[index];

            // Ensure the customer exists in the customer table
            const customer = await this.customerRepo.findOne({
              where: { id: eachCustomer.customer_id, status: 1 },
              relations: ['business_unit'],
            });

            // Skip if the customer does not exist
            if (!customer) {
              continue;
            }

            const userCoupon = this.userCouponRepo.create({
              coupon_code: coupon?.code,
              status: CouponStatus.ISSUED,
              customer: { id: customer.id },
              business_unit: { id: customer.business_unit.id },
              issued_from_type: 'coupon',
              issued_from_id: coupon?.id,
              coupon_id: coupon?.id,
            });
            userCoupons.push(userCoupon);
          }

          // Save all the created UserCoupon in one go (bulk insert)
          if (userCoupons.length) {
            await queryRunner.manager.save(UserCoupon, userCoupons);
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

  async remove(id: number, user: string, permissions: any) {
    // Use the guard's permission object
    const canDeleteCoupons = permissions?.canEditCoupons;

    if (!canDeleteCoupons) {
      throw new ForbiddenException(
        "User doesn't have permission to delete coupons",
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      queryRunner.data = { user };
      const repo = queryRunner.manager.getRepository(Coupon);
      const coupon = await repo.findOne({ where: { id } });
      if (!coupon) throw new Error(`Coupon with id ${id} not found`);

      /**Step 1: Get all coupon_customer_segments
       *  Step 2: with segment.id find all customers
       * Step 3: remove user from UserCoupon
       * Step 4: remove coupon_customer_segments
       */

      // Step 1: Get all coupon_customer_segments
      const couponCustomerSegmentsArr = [];
      const couponCustomerSegments = await this.couponSegmentRepository.find({
        where: { coupon: { id } },
        relations: ['segment'],
      });
      for (let index = 0; index <= couponCustomerSegments.length - 1; index++) {
        const eachSegment = couponCustomerSegments[index];

        // Step 2: with segment.id find all customers
        const customerFromSegments =
          await this.customerSegmentMemberRepository.find({
            where: {
              segment_id: eachSegment.segment.id,
            },
          });

        const customerIds = customerFromSegments.map(
          (singleSegment) => singleSegment.customer_id,
        );
        const customersToDelete = await queryRunner.manager.find(UserCoupon, {
          where: { coupon_id: id, customer: In(customerIds) },
        });

        // Step 3: remove user from UserCoupon
        if (customersToDelete.length) {
          await queryRunner.manager.remove(UserCoupon, customersToDelete);
        }
        couponCustomerSegmentsArr.push(eachSegment.id);
      }

      // Step 4: remove coupon_customer_segments
      const idsToDeleteCouponCustomerSegments = await queryRunner.manager.find(
        CouponCustomerSegment,
        {
          where: { id: In(couponCustomerSegmentsArr) },
        },
      );
      if (idsToDeleteCouponCustomerSegments.length) {
        await queryRunner.manager.remove(
          CouponCustomerSegment,
          idsToDeleteCouponCustomerSegments,
        );
      }

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

  async redeem(bodyPayload, language_code: string = 'en') {
    const { customer_id, campaign_id, metadata, order } = bodyPayload;
    const amount = metadata.products.reduce(
      (sum, product) => sum + product.amount,
      0,
    );

    const today = new Date();

    // Step 1: Get Customer & Wallet Info
    const customer = await this.customerRepo.findOne({
      where: { uuid: customer_id, status: 1 },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    if (customer && customer.status === 0) {
      throw new NotFoundException('Customer is inactive');
    }

    const language = await this.languageRepo.findOne({
      where: { code: language_code },
    });

    if (!language) {
      throw new BadRequestException('Invalid language code');
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
        relations: ['locales', 'locales.language'],
      });
      if (!coupon) throw new NotFoundException('Coupon not found');

      const filteredLocales = coupon.locales?.filter(
        (locale) => locale.language?.id === language.id,
      );

      coupon = {
        ...coupon,
        locales: filteredLocales,
      };

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
      const isUserAssignedTothisCoupon = await this.userCouponRepo.findOne({
        where: [
          { customer: { id: customer.id }, coupon_id: coupon.id },
          { customer: { id: customer.id }, issued_from_id: coupon.id },
        ],
      });

      if (!isUserAssignedTothisCoupon && coupon.all_users == 0) {
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
      coupon.discount_type === 'percentage' &&
      (amount === undefined || amount === null || amount === '')
    ) {
      throw new BadRequestException(`Amount is required`);
    }

    const earnPoints =
      coupon.discount_type === 'fixed'
        ? (coupon.discount_price ?? 0)
        : (amount * Number(coupon.discount_price)) / 100;

    const savedTx = await this.creditWallet({
      point_balance: earnPoints,
      prev_available_points: wallet.available_balance,
      wallet,
      amount: earnPoints,
      sourceType: 'coupon',
      description: `Redeemed ${earnPoints} amount (${coupon.locales?.[0]?.title || ''})`,
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
      coupon_id: coupon?.id,
    });

    coupon.number_of_times_used = Number(coupon.number_of_times_used + 1);
    await this.couponRepo.save(coupon);

    await this.couponUsageRepo.save({
      invoice_no: metadata?.invoice_no || null,
      customer: { id: wallet.customer.id },
      used_at: new Date(),
      created_at: new Date(),
      coupon_id: coupon.id,
      product: metadata?.products ? metadata?.products : [],
      amount: amount,
    });

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
      const valuesArray = condition.value.split('|').map((v) => v.trim());

      switch (condition.type) {
        case 'EMAIL_DOMAIN': {
          const emailDomain = customer.email?.split('@')[1]?.toLowerCase();
          const match = valuesArray
            .map((v) => v.toLowerCase())
            .includes(emailDomain);

          return condition.operator === '==' ? match : !match;
        }

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
      point_balance,
      prev_available_points,
      wallet: wallet,
      uuid: uuidv4(),
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
            const matches: boolean[] = [];

            if (cond?.type) {
              const fieldName = cond.type;
              const vehValue = veh[fieldName];
              let vehicleExtraFeatures = false;
              if (fieldName) {
                if (vehValue === undefined) return false;
                vehicleExtraFeatures = this.applyOperator(
                  String(vehValue.trim()).toLowerCase(),
                  cond.operator,
                  String(cond.value.trim()).toLowerCase(),
                );
                matches.push(vehicleExtraFeatures);
              }
            }

            // Make check (if provided in condition)
            if (cond?.make_name) {
              const makeMatch = cond.make_name
                ? veh.make?.toLowerCase() === cond.make_name.toLowerCase()
                : false;
              matches.push(makeMatch);
            }

            //  Year check (if provided)
            if (cond?.year) {
              const yearMatch = cond.year ? veh.year === cond.year : false;
              matches.push(yearMatch);
            }

            // Model check
            if (cond?.model_name) {
              const modelMatch = cond.model_name
                ? veh.model?.toLowerCase() === cond.model_name.toLowerCase()
                : false;
              matches.push(modelMatch);
            }

            if (cond?.variant_names?.length > 0) {
              let variantMatch = false;
              // Variant check (if provided, match against array of allowed variants)
              if (
                cond?.variant_names?.length == 1 &&
                cond?.variant_names[0] === 'all'
              ) {
                variantMatch = true;
              } else {
                variantMatch =
                  cond.variant_names && cond.variant_names.length > 0
                    ? cond.variant_names.every((v: string) =>
                        veh?.variants?.includes(v),
                      )
                    : false;
              }
              matches.push(variantMatch);
            }

            // If no condition fields provided → false
            if (matches.length === 0) return false;

            // If only 1 field → return it
            if (matches.length === 1) {
              return matches[0];
            }

            // If 2 or more fields → AND condition
            return matches.every(Boolean);
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
          return this.applyOperator(
            service.value.trim(),
            cond.operator!,
            cond.value.trim(),
          );
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
              const matches: boolean[] = [];

              if (cond?.type) {
                const fieldName = cond.type.toLowerCase();
                const vehValue = veh[fieldName];
                let vehicleExtraFeatures = false;
                if (fieldName) {
                  if (vehValue === undefined) return false;

                  // Normalize actual & expected values based on type
                  let actualValue = vehValue;
                  let expectedValue = cond.value;

                  if (typeof actualValue === 'string') {
                    actualValue = actualValue.trim().toLowerCase();
                  } else if (typeof actualValue === 'number') {
                    actualValue = Number(actualValue);
                  }

                  if (typeof expectedValue === 'string') {
                    expectedValue = expectedValue.trim().toLowerCase();
                  } else if (typeof expectedValue === 'number') {
                    expectedValue = Number(expectedValue);
                  }

                  vehicleExtraFeatures = this.applyOperator(
                    actualValue,
                    cond.operator,
                    expectedValue,
                  );
                  matches.push(vehicleExtraFeatures);
                }
              }

              // Make check (if provided in condition)
              if (cond?.make_name) {
                const makeMatch = cond.make_name
                  ? veh.make?.toLowerCase() === cond.make_name.toLowerCase()
                  : false;
                matches.push(makeMatch);
              }

              //  Year check (if provided)
              if (cond?.year) {
                const yearMatch = cond.year ? veh.year === cond.year : false;
                matches.push(yearMatch);
              }

              // Model check
              if (cond?.model_name) {
                const modelMatch = cond.model_name
                  ? veh.model?.toLowerCase() === cond.model_name.toLowerCase()
                  : false;
                matches.push(modelMatch);
              }

              if (cond?.variant_names?.length > 0) {
                let variantMatch = false;
                // Variant check (if provided, match against array of allowed variants)
                if (
                  cond.variant_names.length == 1 &&
                  cond.variant_names[0] === 'all'
                ) {
                  variantMatch = true;
                } else {
                  variantMatch =
                    cond.variant_names && cond.variant_names.length > 0
                      ? cond.variant_names.every((v: string) =>
                          veh?.variants?.includes(v),
                        )
                      : false;
                }
                matches.push(variantMatch);
              }

              // If no condition fields provided → false
              if (matches.length === 0) return false;

              // If only 1 field → return it
              if (matches.length === 1) {
                return matches[0];
              }

              // If 2 or more fields → AND condition
              return matches.every(Boolean);
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
              (s: any) =>
                s.name.toLowerCase().trim() === cond.type.toLowerCase().trim(),
            );

            if (!service) return false;
            return this.applyOperator(
              service.value.trim(),
              cond.operator!,
              cond.value.trim(),
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
        status: 1,
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
            uuid: uuidv4(),
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
              const isAlreadyAssigned = await this.userCouponRepo.findOne({
                where: {
                  customer: { id: customer.id },
                  coupon_id: eachMatchedCoupon.id,
                  status: CouponStatus.ISSUED,
                },
              });

              if (!isAlreadyAssigned) {
                await this.userCouponRepo.save({
                  coupon_code: eachMatchedCoupon.code,
                  status: CouponStatus.ISSUED,
                  customer: { id: customer.id },
                  business_unit: { id: wallet.business_unit.id },
                  issued_from_type: 'coupon',
                  issued_from_id: eachMatchedCoupon.id,
                  coupon_id: eachMatchedCoupon?.id,
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

  async getCustomerCoupons(body, language_code: string = 'bn') {
    const { customerId, bUId, product } = body;
    let customer;
    if (customerId) {
      customer = await this.customerRepo.findOne({
        where: {
          uuid: customerId,
          business_unit: { id: parseInt(bUId) },
          status: 1,
        },
      });

      if (!customer) throw new NotFoundException('Customer not found');
    }

    const userCouponsObj = {
      business_unit: { id: bUId },
      status: In([CouponStatus.EXPIRED, CouponStatus.ISSUED]),
    };

    if (customer && customerId) {
      userCouponsObj['customer'] = { id: customer.id };
    }

    const language = await this.languageRepo.findOne({
      where: { code: language_code },
    });

    if (!language) {
      throw new BadRequestException('Invalid language code');
    }

    const userCoupons = await this.userCouponRepo.find({
      where: userCouponsObj,
      order: { redeemed_at: 'DESC' },
    });

    const available = [];
    const expired = [];
    const today = new Date();
    if (userCoupons.length) {
      for (let index = 0; index <= userCoupons.length - 1; index++) {
        const eachUserCoupon = userCoupons[index];
        let singleCoupon: any = await this.couponsRepository.findOne({
          where: [
            { id: eachUserCoupon.coupon_id },
            { id: eachUserCoupon.issued_from_id },
          ],
          relations: ['locales', 'locales.language'],
        });

        if (!singleCoupon) {
          continue;
        }

        const filteredLocales = singleCoupon.locales?.filter(
          (locale) => locale.language?.id === language.id,
        );
        singleCoupon = {
          ...singleCoupon,
          locales: filteredLocales,
        };

        const services = [];
        const products = [];

        // if it is a simple coupon
        if (
          singleCoupon.coupon_type_id &&
          [
            CouponTypeName.SERVICE_BASED,
            CouponTypeName.PRODUCT_SPECIFIC,
          ].includes(singleCoupon.coupon_type_id)
        ) {
          const conditionTypes = singleCoupon.conditions.map((c) => c.type);
          if (singleCoupon.coupon_type_id == CouponTypeName.PRODUCT_SPECIFIC) {
            products.push(...conditionTypes);
          }

          if (singleCoupon.coupon_type_id == CouponTypeName.SERVICE_BASED) {
            services.push(...conditionTypes);
          }
        }

        // if it is a complex coupon
        if (
          singleCoupon.coupon_type_id == null &&
          singleCoupon?.complex_coupon?.length
        ) {
          singleCoupon.complex_coupon.forEach((c) => {
            const types = c.dynamicRows.map((row) => row.type);

            if (c.coupon_type === CouponTypeName.SERVICE_BASED) {
              services.push(...types);
            }

            if (c.coupon_type === CouponTypeName.PRODUCT_SPECIFIC) {
              products.push(...types);
            }
          });
        }

        if (
          product &&
          !products.some((p) => p.toLowerCase() === product.toLowerCase())
        ) {
          continue;
        }

        if (singleCoupon.date_to && singleCoupon.date_to < today) {
          expired.push({
            uuid: singleCoupon.uuid,
            code: singleCoupon.code,
            title: singleCoupon?.locales?.[0].title,
            description: singleCoupon?.locales?.[0].description,
            terms_and_conditions: singleCoupon?.locales?.[0].term_and_condition,
            discount: `${singleCoupon.discount_price}${singleCoupon.discount_type === 'fixed' ? ' SAR' : '% Off'}`,
            expiry_date: singleCoupon.date_to,
            services,
            products,
          });
        } else {
          available.push({
            uuid: singleCoupon.uuid,
            code: singleCoupon.code,
            title: singleCoupon?.locales?.[0].title,
            description: singleCoupon?.locales?.[0].description,
            terms_and_conditions: singleCoupon?.locales?.[0].term_and_condition,
            discount: `${singleCoupon.discount_price}${singleCoupon.discount_type === 'fixed' ? ' SAR' : '% Off'}`,
            expiry_date: singleCoupon.date_to,
            services,
            products,
          });
        }
      }
    }

    const couponsForAllUser = await this.couponsRepository.find({
      where: [
        { all_users: 1, status: 1, business_unit: { id: parseInt(bUId) } },
      ],
      relations: ['locales', 'locales.language'],
    });

    if (couponsForAllUser.length) {
      for (let index = 0; index <= couponsForAllUser.length - 1; index++) {
        let singleCoupon: any = couponsForAllUser[index];

        const filteredLocales = singleCoupon.locales?.filter(
          (locale) => locale.language?.id === language.id,
        );
        singleCoupon = {
          ...singleCoupon,
          locales: filteredLocales,
        };

        const exists = available.some((c) => c.code === singleCoupon.code);
        if (exists) {
          continue;
        }

        const services = [];
        const products = [];

        // if it is a simple coupon
        if (
          singleCoupon.coupon_type_id &&
          [
            CouponTypeName.SERVICE_BASED,
            CouponTypeName.PRODUCT_SPECIFIC,
          ].includes(singleCoupon.coupon_type_id)
        ) {
          const conditionTypes = singleCoupon?.conditions.map((c) => c.type);
          if (singleCoupon.coupon_type_id == CouponTypeName.PRODUCT_SPECIFIC) {
            products.push(...conditionTypes);
          }
          if (singleCoupon.coupon_type_id == CouponTypeName.SERVICE_BASED) {
            services.push(...conditionTypes);
          }
        }

        // if it is a complex coupon
        if (
          singleCoupon?.coupon_type_id == null &&
          singleCoupon?.complex_coupon?.length
        ) {
          singleCoupon.complex_coupon.forEach((c) => {
            const types = c.dynamicRows.map((row) => row.type);

            if (c.coupon_type === CouponTypeName.SERVICE_BASED) {
              services.push(...types);
            }

            if (c.coupon_type === CouponTypeName.PRODUCT_SPECIFIC) {
              products.push(...types);
            }
          });
        }

        if (
          product &&
          !products.some((p) => p.toLowerCase() === product.toLowerCase())
        ) {
          continue;
        }

        if (singleCoupon.date_to && singleCoupon.date_to < today) {
          expired.push({
            uuid: singleCoupon.uuid,
            code: singleCoupon.code,
            title: singleCoupon?.locales?.[0].title,
            description: singleCoupon?.locales?.[0].description,
            terms_and_conditions: singleCoupon?.locales?.[0].term_and_condition,
            discount: `${singleCoupon.discount_price}${singleCoupon.discount_type === 'fixed' ? ' SAR' : '% Off'}`,
            expiry_date: singleCoupon.date_to,
            services,
            products,
          });
        } else {
          available.push({
            uuid: singleCoupon.uuid,
            code: singleCoupon.code,
            title: singleCoupon?.locales?.[0].title,
            description: singleCoupon?.locales?.[0].description,
            terms_and_conditions: singleCoupon?.locales?.[0].term_and_condition,
            discount: `${singleCoupon.discount_price}${singleCoupon.discount_type === 'fixed' ? ' SAR' : '% Off'}`,
            expiry_date: singleCoupon.date_to,
            services,
            products,
          });
        }
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

  async syncCoupons(body) {
    const { coupons } = body;

    const failedCoupons = [];
    const successCoupons = [];
    const couponUsageArr = [];

    try {
      for (let index = 0; index <= coupons.length - 1; index++) {
        const eachCoupon = coupons[index];
        const coupon = await this.couponsRepository.findOne({
          where: { code: eachCoupon.code },
        });
        if (coupon) {
          successCoupons.push(eachCoupon);
          const phoneNumber = eachCoupon.customer_phone_no;
          const customer = await this.findCustomerByFullPhone(phoneNumber);
          if (customer) {
            const couponUsageObj = {
              invoice_no: eachCoupon.invoice_no,
              customer: customer.id,
              used_at: eachCoupon.used_time,
              created_at: new Date(),
              coupon_id: coupon.id,
            };
            couponUsageArr.push(couponUsageObj);
          }
        } else {
          failedCoupons.push(eachCoupon);
        }
      }

      // ✅ decide status
      let status: 'success' | 'failed' | 'partial';
      if (successCoupons.length === coupons.length) {
        status = 'success';
      } else if (failedCoupons.length === coupons.length) {
        status = 'failed';
      } else {
        status = 'partial';
      }

      await this.couponSyncLogRepo.save({
        status,
        total_count: coupons.length,
        success_count: successCoupons.length,
        failed_count: failedCoupons.length,
        created_at: new Date(),
        success_coupons: successCoupons,
        failed_coupons: failedCoupons,
      });

      if (couponUsageArr.length && successCoupons.length) {
        await this.couponUsageRepo.save(couponUsageArr);
      }

      return {
        success: true,
        message: 'Coupon synced success!',
        result: coupons,
        errors: [],
      };
    } catch (error) {
      console.error('Error while syncing coupons:', error);
      return {
        success: false,
        message: 'Coupon sync failed!',
        result: null,
        errors: [error.message || error],
      };
    }
  }

  async findCustomerByFullPhone(fullPhone: string) {
    if (!fullPhone.startsWith('+')) {
      throw new Error('Invalid phone number format');
    }

    // remove the "+"
    const digits = fullPhone.slice(1);

    // possible country code lengths: 1, 2, 3
    for (let len = 1; len <= 3; len++) {
      const countryCode = '+' + digits.slice(0, len);
      const phone = digits.slice(len);

      const customer = await this.customerRepo.findOne({
        where: {
          country_code: countryCode,
          phone: phone,
          status: 1,
        },
      });

      if (customer) {
        return customer; // ✅ found
      }
    }

    return null; // not found
  }

  async importFromCsv(filePath: string, body: any, user: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    queryRunner.data = { user };
    const repo = queryRunner.manager.getRepository(Coupon);

    return new Promise((resolve, reject) => {
      const coupons = [];

      fs.createReadStream(filePath)
        .pipe(fastcsv.parse({ headers: true }))
        .on('data', async (row) => {
          try {
            // Create a fresh coupon for each row
            const { locales, id, conditions, complex_coupon, ...rest } = body;
            const parsedLocales =
              typeof locales === 'string' ? JSON.parse(locales) : locales;
            const singleCoupon = repo.create({
              ...(id && { id }),
              ...rest,
              code: row.coupon_code,
              conditions: conditions ? JSON.parse(conditions) : null,
              complex_coupon: complex_coupon
                ? JSON.parse(complex_coupon)
                : null,
              locales: parsedLocales?.map((locale) => ({
                language: { id: locale.languageId },
                title: locale.title,
                description: locale.description,
                term_and_condition: locale.term_and_condition,
                desktop_image: locale.desktop_image,
                mobile_image: locale.mobile_image,
                general_error: locale.general_error,
                exception_error: locale.exception_error,
                benefits: locale.benefits,
              })) as any,
            });
            coupons.push(singleCoupon);
          } catch (err) {
            console.error('Invalid row:', row, err);
          }
        })
        .on('end', async () => {
          try {
            if (coupons.length > 0) {
              // Save all coupons at once
              const uploadedCoupons = await repo.save(coupons);

              if (uploadedCoupons.length) {
                const customerSegmentIds = Array.isArray(
                  body.customer_segment_ids,
                )
                  ? body.customer_segment_ids
                  : JSON.parse(body.customer_segment_ids || '[]');

                if (customerSegmentIds?.length && body.all_users == 0) {
                  // Fetch all customers that belong to the given customer segments
                  const customerFromSegments =
                    await this.customerSegmentMemberRepository.find({
                      where: { segment_id: In(customerSegmentIds) },
                    });

                  if (!customerFromSegments.length) {
                    throw new BadRequestException(
                      'No customers found in the given segments',
                    );
                  }

                  // Validate segments once
                  const segments = await this.segmentRepository.findBy({
                    id: In(customerSegmentIds),
                  });

                  if (segments.length !== customerSegmentIds.length) {
                    throw new BadRequestException(
                      'Some customer segments not found',
                    );
                  }

                  const allUserCoupons: UserCoupon[] = [];

                  // 👉 assign coupons based on the smaller length
                  const loopCount = Math.min(
                    uploadedCoupons.length,
                    customerFromSegments.length,
                  );

                  for (let i = 0; i < loopCount; i++) {
                    const eachCoupon = uploadedCoupons[i];
                    const eachCustomer = customerFromSegments[i];

                    // Save coupon-segment mapping
                    const couponSegmentEntities = segments.map((segment) =>
                      this.couponSegmentRepository.create({
                        coupon: eachCoupon,
                        segment,
                      }),
                    );

                    await queryRunner.manager.save(
                      CouponCustomerSegment,
                      couponSegmentEntities,
                    );

                    // Ensure the customer exists in the customer table
                    const customer = await this.customerRepo.findOne({
                      where: { id: eachCustomer.customer_id, status: 1 },
                      relations: ['business_unit'],
                    });

                    if (!customer) {
                      continue;
                    }

                    const userCoupon = this.userCouponRepo.create({
                      coupon_code: eachCoupon.code,
                      status: CouponStatus.ISSUED,
                      customer: { id: customer.id },
                      business_unit: { id: customer.business_unit.id },
                      issued_from_type: 'coupon',
                      issued_from_id: eachCoupon.id,
                      coupon_id: eachCoupon?.id,
                    });

                    allUserCoupons.push(userCoupon);
                  }

                  // Save all coupons for all customers in one go
                  if (allUserCoupons.length) {
                    await queryRunner.manager.save(UserCoupon, allUserCoupons);
                  }
                }
              }

              await queryRunner.commitTransaction();

              resolve({
                success: true,
                message: 'Data uploaded successfully',
                total: uploadedCoupons.length,
              });
            } else {
              await queryRunner.rollbackTransaction();
              resolve({
                success: false,
                message: 'No valid coupons found in CSV',
                total: 0,
              });
            }
          } catch (err) {
            await queryRunner.rollbackTransaction();
            reject(err);
          } finally {
            await queryRunner.release();
            // ✅ Always remove uploaded file after finishing
            try {
              fs.unlinkSync(filePath);
            } catch (unlinkErr) {
              console.error('Failed to delete file:', unlinkErr);
            }
          }
        })
        .on('error', async (err) => {
          await queryRunner.rollbackTransaction();
          await queryRunner.release();

          try {
            fs.unlinkSync(filePath);
          } catch (unlinkErr) {
            console.error('Failed to delete file:', unlinkErr);
          }

          reject(err);
        });
    });
  }

  async getCustomerAssignedCoupons(body, search, language_code: string = 'en') {
    const { customerId, bUId, page = 1, limit = 10 } = body;

    const customer = await this.customerRepo.findOne({
      where: {
        uuid: customerId,
        business_unit: { id: parseInt(bUId) },
        status: 1,
      },
    });

    if (!customer) throw new NotFoundException('Customer not found');
    if (
      customer.status === 0 ||
      customer.is_delete_requested === 1 ||
      customer.deletion_status === 1
    ) {
      throw new NotFoundException(
        'This customer is no longer active or has been removed',
      );
    }
    if (customer.status === 3) {
      throw new NotFoundException('Customer is deleted');
    }

    const language = await this.languageRepo.findOne({
      where: { code: language_code },
    });

    if (!language) {
      throw new BadRequestException('Invalid language code');
    }

    const userCouponsWhereClouse = {
      customer: { id: customer.id },
      status: In([CouponStatus.EXPIRED, CouponStatus.ISSUED]),
    };

    if (search && search != undefined) {
      userCouponsWhereClouse['coupon_code'] = ILike(`%${search}%`);
    }

    const userCoupons = await this.userCouponRepo.find({
      where: userCouponsWhereClouse,
      order: { redeemed_at: 'DESC' },
    });

    const coupons: any[] = [];
    const today = new Date();

    for (const eachUserCoupon of userCoupons) {
      let singleCoupon: any = await this.couponsRepository.findOne({
        where: [
          { id: eachUserCoupon.coupon_id },
          { id: eachUserCoupon.issued_from_id },
        ],
        relations: ['locales', 'locales.language'],
      });

      const filteredLocales = singleCoupon.locales?.filter(
        (locale) => locale.language?.id === language.id,
      );
      singleCoupon = {
        ...singleCoupon,
        locales: filteredLocales,
      };

      if (!singleCoupon) continue;

      coupons.push({
        uuid: singleCoupon.uuid,
        code: singleCoupon.code,
        title: singleCoupon?.locales?.[0].title,
        expiry_date: singleCoupon.date_to,
        status:
          singleCoupon.date_to && singleCoupon.date_to < today
            ? 'expired'
            : 'available',
      });
    }

    let where: any = [{ all_users: 1, status: 1 }];
    if (search) {
      where = [{ all_users: 1, status: 1, code: ILike(`%${search}%`) }];
    }

    let couponsForAllUser: any = await this.couponsRepository.find({
      where,
      relations: ['locales', 'locales.language'],
    });

    couponsForAllUser = couponsForAllUser
      .map((coupon) => ({
        ...coupon,
        locales: coupon.locales.filter(
          (locale) => locale.language?.id === language.id,
        ),
      }))
      .filter((coupon) => coupon.locales.length > 0);

    for (const singleCoupon of couponsForAllUser) {
      coupons.push({
        uuid: singleCoupon.uuid,
        code: singleCoupon.code,
        title: singleCoupon?.locales?.[0].title,
        expiry_date: singleCoupon.date_to,
        status:
          singleCoupon.date_to && singleCoupon.date_to < today
            ? 'expired'
            : 'available',
      });
    }

    // ✅ Pagination helper
    const total = coupons.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const end = start + limit;

    const paginatedData = coupons.slice(start, end);

    return {
      success: true,
      message: 'Successfully fetched the data!',
      result: {
        data: paginatedData,
        total,
        page,
        limit,
        totalPages,
      },
      errors: [],
    };
  }

  async getCouponUsedHistory(body, search) {
    const { customerId, bUId, page = 1, limit = 10 } = body;

    const customer = await this.customerRepo.findOne({
      where: {
        uuid: customerId,
        business_unit: { id: parseInt(bUId) },
        status: 1,
      },
    });

    if (!customer) throw new NotFoundException('Customer not found');
    if (
      customer.status === 0 ||
      customer.is_delete_requested === 1 ||
      customer.deletion_status === 1
    ) {
      throw new NotFoundException(
        'This customer is no longer active or has been removed',
      );
    }
    if (customer.status === 3) {
      throw new NotFoundException('Customer is deleted');
    }

    const whereClouse = {
      customer: { id: customer.id },
    };

    if (search && search != undefined) {
      whereClouse['invoice_no'] = ILike(`%${search}%`);
    }

    const usageCoupons = await this.couponUsageRepo.find({
      where: whereClouse,
    });

    const coupons = [];
    for (let index = 0; index <= usageCoupons.length - 1; index++) {
      const eachUsageCoupon = usageCoupons[index];
      const coupon = await this.couponRepo.findOne({
        where: { id: eachUsageCoupon.coupon_id },
      });
      coupons.push({
        ...eachUsageCoupon,
        code: coupon.code,
      });
    }

    // ✅ Pagination helper
    const total = coupons.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const end = start + limit;

    const paginatedData = coupons.slice(start, end);

    return {
      success: true,
      message: 'Successfully fetched the data!',
      result: {
        data: paginatedData,
        total,
        page,
        limit,
        totalPages,
      },
      errors: [],
    };
  }

  async uploadFileToBucket(buffer, bucketName, objectName) {
    return await this.ociService.uploadBufferToOci(
      buffer,
      bucketName,
      objectName,
    );
  }

  async getCouponCriterias(body) {
    const { tenantId, bUId, coupon_code } = body;

    const coupon = await this.couponRepo.findOne({
      where: {
        code: coupon_code,
        tenant_id: tenantId,
        business_unit: { id: bUId },
        status: 1,
      },
    });

    if (!coupon) throw new NotFoundException('Coupon not found');

    const tiers = await this.tierRepo.find({
      where: {
        tenant: { id: tenantId },
        business_unit: { id: bUId },
      },
    });

    const responseObj = {
      coupon_code: coupon.code,
      expiry_date: coupon.date_to,
      eligible_criteria: coupon.coupon_type_id
        ? this.makeCriteriaFromCouponPayloadForSimpleCoupon(
            coupon.coupon_type_id,
            coupon.conditions,
            tiers,
          )
        : this.makeCriteriaFromCouponPayload(coupon.complex_coupon, tiers),
    };

    const today = new Date();
    if (coupon.date_to && coupon.date_to < today) {
      return {
        success: false,
        message: 'This coupon has been expired',
        result: responseObj,
        errors: [],
      };
    }

    return {
      success: true,
      message: 'Successfully fetched the data!',
      result: responseObj,
      errors: [],
    };
  }

  //For Complex coupon validate
  makeCriteriaFromCouponPayload(conditions, tiers = []) {
    const result = {};

    conditions.forEach((coupon) => {
      const { selectedCouponType, dynamicRows } = coupon;

      switch (selectedCouponType) {
        case CouponType.SERVICE_BASED:
          result['services'] = dynamicRows.map((row) => ({
            name: row.type,
            value: row.value,
          }));
          break;

        case CouponType.PRODUCT_SPECIFIC:
          result['products'] = dynamicRows.map((row) => ({ name: row.type }));
          break;

        case CouponType.DISCOUNT:
          result['discounts'] = dynamicRows.map((row) => ({ name: row.type }));
          break;

        case CouponType.BIRTHDAY:
          result['birthday'] = true;
          break;

        case CouponType.TIER_BASED:
          result['tiers'] = dynamicRows.map((row) => {
            const matchedTier = tiers.find((t) => t.id === row.tier);
            return { name: matchedTier ? matchedTier.name : null };
          });
          break;

        case CouponType.GEO_TARGETED:
          result['geoTargated'] = dynamicRows.map((row) => ({
            name: row.type,
          }));
          break;

        case CouponType.REFERRAL:
          result['referral'] = dynamicRows.map((row) => ({
            name: row.type,
            value: row.value,
          }));
          break;

        case CouponType.USER_SPECIFIC:
          result['userSpecific'] = dynamicRows.map((row) => ({
            name: row.type,
            value: row.value,
          }));
          break;

        case CouponType.VEHICLE_SPECIFIC: {
          result['vehicle'] = dynamicRows.map((row) => {
            const vehicleObj: any = {
              make: row.make_name,
              model: row.model_name,
              variants: row.variant_names,
              year: row.year,
              [row.type]: row.value,
            };

            // Remove null, undefined, empty string, empty array
            Object.keys(vehicleObj).forEach((key) => {
              const value = vehicleObj[key];
              const isEmptyArray = Array.isArray(value) && value.length === 0;
              const isEmptyValue =
                value === null || value === undefined || value === '';
              if (isEmptyArray || isEmptyValue) {
                delete vehicleObj[key];
              }
            });
            return vehicleObj;
          });
          break;
        }

        default:
          break;
      }
    });

    return result;
  }

  //For Simple coupon validate
  makeCriteriaFromCouponPayloadForSimpleCoupon(
    coupon_type_id,
    conditions,
    tiers = [],
  ) {
    const result = {};

    const add = (key, value) => {
      if (!result[key]) result[key] = [];
      result[key].push(value);
    };

    conditions?.forEach((coupon) => {
      switch (coupon_type_id) {
        case CouponTypeName.USER_SPECIFIC:
          add('userSpecific', { name: coupon.type, value: coupon.value });
          break;

        case CouponTypeName.PRODUCT_SPECIFIC:
          add('products', { name: coupon.type });
          break;

        case CouponTypeName.SERVICE_BASED:
          add('serivices', { name: coupon.type, value: coupon.value });
          break;

        case CouponTypeName.DISCOUNT:
          add('discounts', { name: coupon.type, value: coupon.value });
          break;

        case CouponTypeName.TIER_BASED: {
          const matchedTier = tiers.find((t) => t.id === coupon.tier);
          add('tiers', { name: matchedTier ? matchedTier.name : null });
          break;
        }

        case CouponTypeName.GEO_TARGETED:
          add('geoTargated', { name: coupon.type });
          break;

        case CouponTypeName.VEHICLE_SPECIFIC:
          const vehicleObj = {
            make: coupon.make_name || null,
            model: coupon.model_name || null,
            variants: coupon.variant_names || null,
            year: coupon.year || null,
            [coupon.type]: coupon.value || null,
          };
          // Remove null, undefined, empty string, empty array
          Object.keys(vehicleObj).forEach((key) => {
            const value = vehicleObj[key];
            const isEmptyArray = Array.isArray(value) && value.length === 0;
            const isEmptyValue =
              value === null || value === undefined || value === '';
            if (isEmptyArray || isEmptyValue) {
              delete vehicleObj[key];
            }
          });
          add('vehicle', vehicleObj);
          break;

        case CouponTypeName.REFERRAL:
          add('referral', { name: coupon.type, value: coupon.value });
          break;
      }
    });

    if (coupon_type_id == CouponTypeName.BIRTHDAY) {
      result['birthday'] = true;
    }

    return result;
  }

  async validateCoupon(bodyPayload) {
    const today = new Date();
    const { customer_id, campaign_id, metadata } = bodyPayload;

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
            'Customer is not eligible for this coupon 11',
          );
        }
      }
    }

    // Checking customer is assigned to this coupon or not
    if (hasSegments.length === 0) {
      const isUserAssignedTothisCoupon = await this.userCouponRepo.findOne({
        where: [
          { customer: { id: customer.id }, coupon_id: coupon.id },
          { customer: { id: customer.id }, issued_from_id: coupon.id },
        ],
      });

      if (!isUserAssignedTothisCoupon && coupon.all_users == 0) {
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
        const criteria = await this.makeCriteriaFromCouponPayload(conditions);
        throw new BadRequestException({
          success: false,
          message: 'Coupon is not applicable',
          requiredCriteria: criteria,
        });
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
        // throw new BadRequestException('Coupon is not applicable');
        const criteria =
          await this.makeCriteriaFromCouponPayloadForSimpleCoupon(
            coupon?.coupon_type_id,
            coupon.conditions,
          );
        throw new BadRequestException({
          success: false,
          message: 'Coupon is not applicable',
          requiredCriteria: criteria,
        });
      }
    }

    // Step 5:
    // Checking if coupon already rewarded or not
    await this.checkAlreadyRewaredCoupons(
      wallet.customer.uuid,
      coupon.uuid,
      coupon,
    );

    return {
      success: true,
      message: 'Customer is eligible for this coupon',
    };
  }

  async migrateCoupon(bodyPayload) {
    const { tenantId } = bodyPayload;
    console.log('//////////migrate-coupon');
    const tenant = await this.tenantRepository.findOne({
      where: { uuid: tenantId },
      relations: ['languages', 'languages.language'],
    });
    console.log('//////////migrate-coupon');
    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    console.log('//////////migrate-coupon');
    const results = [];
    // const filePath = path.resolve(process.cwd(), 'uploads/loyalty_coupons.csv'); // File in local system
    const filePath = process.env.COUPON_CSV_PATH; // File in remote server
    if (!filePath) {
      throw new BadRequestException('COUPON_CSV_PATH is not defined in env');
    }

    const stream = filePath.startsWith('http')
      ? await this.getRemoteFileStream(filePath)
      : fs.createReadStream(filePath);
    const coupons: any = await new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => resolve(results))
        .on('error', (err) => reject(err));
    });

    let migratedCount = 0;
    let skipCount = 0;
    for (const row of coupons) {
      try {
        const existing = await this.couponRepo.findOne({
          where: { external_system_id: row.id },
        });

        if (!existing) {
          skipCount++;
          continue;
        }

        const titleEn = row?.title;
        const descriptionEn = row?.description;
        const termAndConditionEn = row?.terms_condition;

        let titleAr = row?.title_ar;
        if (!titleAr && titleEn) {
          titleAr = await this.openAIService.translateToArabic(titleEn);
        }

        let descriptionAr = row?.description_ar;
        if (!descriptionAr && descriptionEn) {
          descriptionAr =
            await this.openAIService.translateToArabic(descriptionEn);
        }

        let termAndConditionAr = row?.terms_conditions_ar;
        if (!termAndConditionAr && termAndConditionEn) {
          termAndConditionAr =
            await this.openAIService.translateToArabic(termAndConditionEn);
        }

        for (let index = 0; index <= tenant?.languages.length - 1; index++) {
          const singleLanguage = tenant?.languages[index];

          if (singleLanguage.language.code === 'en') {
            const localeCouponEn = this.couponLocaleRepo.create({
              coupon: { id: existing?.id },
              language: { id: singleLanguage?.language?.id },
              title: titleEn,
              description: descriptionEn,
              term_and_condition: termAndConditionEn,
            });
            await this.couponLocaleRepo.save(localeCouponEn);
          }

          if (singleLanguage.language.code === 'ar') {
            const localeCouponEn = this.couponLocaleRepo.create({
              coupon: { id: existing?.id },
              language: { id: singleLanguage?.language?.id },
              title: titleAr,
              description: descriptionAr,
              term_and_condition: termAndConditionAr,
            });
            await this.couponLocaleRepo.save(localeCouponEn);
          }
        }

        migratedCount++;
      } catch (err) {
        console.error(`❌ Failed to insert ${row.coupon_code}`, err.message);
        throw new BadRequestException('Failed to migrate coupon', err.message);
      }
    }
    return {
      success: true,
      message: `Coupons migrated successfully`,
      migratedCount,
      skipCount,
    };
  }

  private async getRemoteFileStream(url: string): Promise<Readable> {
    const response = await axios.get(url, {
      responseType: 'stream',
      decompress: false, // ✅ CRITICAL LINE
      headers: {
        'Accept-Encoding': 'identity',
        'Content-Type': 'text/csv',
      },
    });

    console.log('Remote CSV Content-Type:', response.headers['content-type']);

    if (
      !response.headers['content-type']?.includes('csv') &&
      !response.headers['content-type']?.includes('octet-stream')
    ) {
      throw new Error('URL is NOT returning a CSV file');
    }
    return response.data;
  }
}
