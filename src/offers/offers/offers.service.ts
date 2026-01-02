import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { CustomerSegmentMember } from 'src/customer-segment/entities/customer-segment-member.entity';
import { CustomerSegment } from 'src/customer-segment/entities/customer-segment.entity';
import { Customer } from 'src/customers/entities/customer.entity';
import { LanguageEntity } from 'src/master/language/entities/language.entity';
import { OciService } from 'src/oci/oci.service';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { User } from 'src/users/entities/user.entity';
import { DataSource, In, Not, Repository } from 'typeorm';
import { CreateOfferDto, UpdateOfferDto } from '../dto/offers.dto';
import { OfferCustomerSegment } from '../entities/offer-customer-segments.entity';
import { OffersEntity } from '../entities/offers.entity';
import { UserOffer } from '../entities/user-offer.entity';
import { ActiveStatus, OfferStatus } from '../type/types';
import { OfferCouponAssignment } from '../entities/offers-coupon-assignment.entity';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class OffersService {
  constructor(
    @InjectRepository(OffersEntity)
    private offerRepository: Repository<OffersEntity>,

    @InjectRepository(User)
    private userRepository: Repository<User>,

    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,

    @InjectRepository(BusinessUnit)
    private businessUnitRepository: Repository<BusinessUnit>,

    @InjectRepository(CustomerSegment)
    private segmentRepository: Repository<CustomerSegment>,

    @InjectRepository(OfferCustomerSegment)
    private offerCustomerSegment: Repository<OfferCustomerSegment>,

    @InjectRepository(CustomerSegmentMember)
    private readonly customerSegmentMemberRepository: Repository<CustomerSegmentMember>,

    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,

    @InjectRepository(UserOffer)
    private userOfferRepo: Repository<UserOffer>,

    @InjectRepository(LanguageEntity)
    private languageRepo: Repository<LanguageEntity>,

    @InjectRepository(OfferCouponAssignment)
    private offerCouponAssignmentRepo: Repository<OfferCouponAssignment>,

    @InjectDataSource()
    private readonly dataSource: DataSource,

    private readonly ociService: OciService,
  ) {}

  async create(dto: CreateOfferDto, user: string, permission: any) {
    if (!permission.canCreateOffers) {
      throw new BadRequestException(
        "You don't have permission to create offers",
      );
    }
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    queryRunner.data = { user };

    try {
      const { locales, id, ...rest } = dto;
      const offer = this.offerRepository.create({
        ...(id && { id }),
        ...rest,
        locales: locales?.map((locale) => ({
          language: { id: locale.languageId },
          title: locale.title,
          subtitle: locale.subtitle,
          description: locale.description,
          term_and_condition: locale.term_and_condition,
          desktop_image: locale.desktop_image,
          mobile_image: locale.mobile_image,
          benefits: locale.benefits,
        })) as any,
      });
      const savedOffer = await this.offerRepository.save(offer);

      // Handle coupon codes if provided
      if (dto.coupon_codes && dto.coupon_codes.length > 0) {
        const couponAssignments = dto.coupon_codes.map((couponCode) =>
          this.offerCouponAssignmentRepo.create({
            offer: savedOffer,
            offer_id: savedOffer.id,
            coupon_code: couponCode,
            status: 'AVAILABLE',
            coupon_source: dto.coupon_source,
          }),
        );

        await queryRunner.manager.save(
          OfferCouponAssignment,
          couponAssignments,
        );
      }

      if (dto.customer_segment_ids?.length && dto.all_users === 0) {
        const segments = await this.segmentRepository.findBy({
          id: In(dto.customer_segment_ids),
        });

        if (segments.length !== dto.customer_segment_ids.length) {
          throw new BadRequestException('Some customer segments not found');
        }

        const offerSegmentEntities = segments.map((segment) =>
          this.offerCustomerSegment.create({
            offer: savedOffer,
            segment,
          }),
        );

        await queryRunner.manager.save(
          OfferCustomerSegment,
          offerSegmentEntities,
        );

        const customerFromSegments =
          await this.customerSegmentMemberRepository.find({
            where: {
              segment_id: In(dto.customer_segment_ids),
            },
          });

        if (customerFromSegments.length) {
          const userOffers: UserOffer[] = [];

          for (const eachCustomer of customerFromSegments) {
            const customer = await this.customerRepo.findOne({
              where: { id: eachCustomer.customer_id, status: 1 },
              relations: ['business_unit'],
            });

            if (!customer) continue;

            userOffers.push(
              this.userOfferRepo.create({
                status: OfferStatus.ISSUED,
                customer: { id: customer.id },
                business_unit: { id: customer.business_unit.id },
                issued_from_type: 'offer',
                issued_from_id: savedOffer.id,
                offer_id: savedOffer.id,
              }),
            );
          }

          if (userOffers.length) {
            await queryRunner.manager.save(UserOffer, userOffers);
          }
        }
      }

      await queryRunner.commitTransaction();
      const cleanOffer = this.omitExtraFields(savedOffer, ['id']);
      return cleanOffer;
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
    business_unit_id: number,
    page: number = 1,
    pageSize: number = 10,
    langCode: string = 'en',
    permission: any,
  ) {
    if (!permission.canViewOffers) {
      throw new BadRequestException(
        "You don't have permission to access offers",
      );
    }
    const take = pageSize;
    const skip = (page - 1) * take;

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
        (p.module === 'businessUnits' &&
          p.name === `${tenantName}_All Business Unit`) ||
        (p.module === 'tenants' && p.name !== 'all_tenants'),
    );

    const query = this.offerRepository
      .createQueryBuilder('offer')
      .leftJoinAndSelect('offer.business_unit', 'business_unit')
      .leftJoinAndSelect('offer.locales', 'locale')
      .leftJoinAndSelect('locale.language', 'language')
      .where('offer.status != :status', { status: 2 })
      .andWhere('offer.tenant_id = :tenantId', { tenantId: client_id });

    if (
      business_unit_id &&
      typeof business_unit_id === 'string' &&
      business_unit_id !== '1'
    ) {
      query.andWhere('offer.business_unit_id = :businessUnitId', {
        businessUnitId: business_unit_id,
      });
    }

    if (!hasGlobalAccess && !isSuperAdmin) {
      const accessibleBusinessUnitNames = privileges
        .filter(
          (p) =>
            p.module === 'businessUnits' &&
            p.name.startsWith(`${tenantName}_`) &&
            p.name !== `${tenantName}_All Business Unit`,
        )
        .map((p) => p.name.replace(`${tenantName}_`, ''));

      if (!accessibleBusinessUnitNames.length) {
        return {
          data: [],
          total: 0,
          page,
          pageSize,
          totalPages: 0,
        };
      }

      const businessUnits = await this.businessUnitRepository.find({
        where: {
          status: 1,
          tenant_id: client_id,
          name: In(accessibleBusinessUnitNames),
        },
      });

      const availableBusinessUnitIds = businessUnits.map((unit) => unit.id);

      if (availableBusinessUnitIds.length) {
        query.andWhere('offer.business_unit_id IN (:...ids)', {
          ids: availableBusinessUnitIds,
        });
      }
    }

    if (langCode) {
      query.andWhere('language.code = :langCode', { langCode });
    }

    if (name && name.trim() !== '') {
      query.andWhere('locale.title LIKE :search', {
        search: `%${name.trim()}%`,
      });
    }

    query.orderBy('offer.created_at', 'DESC').skip(skip).take(take);

    const [data, total] = await query.getManyAndCount();

    const removeExtraFields = ['id'];
    const offers = this.omitExtraFields(data, removeExtraFields);
    return {
      data: offers,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(uuid: string) {
    const offer = await this.offerRepository.findOne({
      where: { uuid: uuid },
      relations: [
        'business_unit',
        'customerSegments',
        'customerSegments.segment',
      ],
      order: { created_at: 'DESC' },
    });

    if (!offer) throw new NotFoundException('Offer not found');

    const removeExtraFields = [];
    const offers = this.omitExtraFields(offer, removeExtraFields);
    return offers;
  }

  async remove(uuid: string, user: string, permission: any) {
    if (!permission.canDeleteOffers) {
      throw new BadRequestException(
        "You don't have permission to delete offers",
      );
    }
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      queryRunner.data = { user };
      const repo = queryRunner.manager.getRepository(OffersEntity);
      const offer = await repo.findOne({ where: { uuid: uuid } });
      if (!offer) throw new Error(`Offer with id ${uuid} not found`);
      offer.status = 2;
      await repo.save(offer);
      await queryRunner.commitTransaction();
      return { message: 'Deleted successfully' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async update(
    uuid: string,
    dto: UpdateOfferDto,
    user: string,
    permission: any,
  ) {
    if (!permission.canEditOffers) {
      throw new BadRequestException("You don't have permission to edit offers");
    }
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      queryRunner.data = { user };
      const repo = queryRunner.manager.getRepository(OffersEntity);
      const offer = await repo.findOne({ where: { uuid: uuid } });

      if (!offer) throw new Error(`Offer with id ${uuid} not found`);
      Object.assign(offer, dto);
      await repo.save(offer);

      // === COUPON CODES UPDATE ===
      // Handle coupon codes if provided in the update
      if (dto.coupon_codes && dto.coupon_codes.length > 0) {
        // Add new coupon codes from the update
        const couponAssignments = dto.coupon_codes.map((couponCode) =>
          this.offerCouponAssignmentRepo.create({
            offer: offer,
            offer_id: offer.id,
            coupon_code: couponCode,
            status: 'AVAILABLE',
            coupon_source: dto.coupon_source || offer.coupon_source,
          }),
        );

        await queryRunner.manager.save(
          OfferCouponAssignment,
          couponAssignments,
        );
      }

      // === CUSTOMER SEGMENTS SYNC ===
      const incomingSegmentIds = dto.customer_segment_ids || [];
      const existingRelations = await this.offerCustomerSegment.find({
        where: { offer: { id: offer.id } },
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
        const toDelete = await queryRunner.manager.find(OfferCustomerSegment, {
          where: { offer: { id: offer.id }, segment: In(toRemove) },
        });
        if (toDelete.length) {
          await queryRunner.manager.remove(OfferCustomerSegment, toDelete);
        }

        /* Delete all user_offer
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

          const customersToDelete = await queryRunner.manager.find(UserOffer, {
            where: { offer_id: offer.id, customer: In(customerArr) },
          });

          if (customersToDelete.length) {
            await queryRunner.manager.remove(UserOffer, customersToDelete);
          }
        }
      }

      if (toAdd.length) {
        const segments = await this.segmentRepository.findBy({ id: In(toAdd) });

        if (segments.length !== toAdd.length) {
          throw new BadRequestException('Some customer segments not found');
        }

        const newLinks = segments.map((segment) =>
          this.offerCustomerSegment.create({
            offer,
            segment,
          }),
        );

        await queryRunner.manager.save(OfferCustomerSegment, newLinks);

        // Fetch all customers that belong to the given customer segments
        const customerFromSegments =
          await this.customerSegmentMemberRepository.find({
            where: {
              segment_id: In(toAdd),
            },
          });

        if (customerFromSegments.length) {
          const userOffers: UserOffer[] = [];
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

            const userOffer = this.userOfferRepo.create({
              status: OfferStatus.ISSUED,
              customer: { id: customer.id },
              business_unit: { id: customer.business_unit.id },
              issued_from_type: 'offer',
              issued_from_id: offer?.id,
              offer_id: offer?.id,
            });
            userOffers.push(userOffer);
          }

          // Save all the created userOffer in one go (bulk insert)
          if (userOffers.length) {
            await queryRunner.manager.save(UserOffer, userOffers);
          }
        }
      }

      await queryRunner.commitTransaction();
      return await this.findOne(uuid);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async uploadFileToBucket(buffer, bucketName, objectName) {
    return await this.ociService.uploadBufferToOci(
      buffer,
      bucketName,
      objectName,
    );
  }

  async findAllForThirdParty(
    tenant_id: number,
    name: string,
    page: number = 1,
    pageSize: number = 10,
    langCode: string = 'en',
  ) {
    const take = pageSize;
    const skip = (page - 1) * take;

    const tenant = await this.tenantRepository.findOne({
      where: { id: tenant_id },
    });
    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    const language = await this.languageRepo.findOne({
      where: { code: langCode },
    });

    if (!language) {
      throw new BadRequestException('Invalid language code');
    }

    const baseConditions = {
      status: Not(2),
      tenant_id: tenant_id,
      show_in_app: 1,
    };
    let whereClause = {};

    const removeExtraFields = [
      'id',
      // 'uuid',
      'tenant_id',
      'business_unit_id',
      'external_system_id',
      'all_users',
      'created_by',
      'created_at',
      'updated_by',
      'updated_at',
      'business_unit',
      'language',
      'createdAt',
      'updatedAt',
      'createdBy',
      'updatedBy',
      'deletedAt',
    ];

    whereClause = [baseConditions];

    const [data, total] = await this.offerRepository.findAndCount({
      where: whereClause,
      relations: ['business_unit', 'locales'],
      order: { created_at: 'DESC' },
      take,
      skip,
    });

    const filteredOffers = data
      .map((offer) => {
        const locale: any = offer.locales.find(
          (loc) =>
            loc.language?.code === langCode || loc.language.id === language.id,
        );

        const filtered =
          locale?.benefits &&
          locale?.benefits?.map((b) => ({
            [`name_${langCode}`]: b[`name_${langCode}`],
            icon: b.icon,
          }));

        return {
          ...locale,
          status: offer.status,
          date_from: offer.date_from,
          date_to: offer.date_to,
          benefits: filtered || [],
        };
      })
      .filter(Boolean);

    const offers = this.omitExtraFields(filteredOffers, removeExtraFields);
    return {
      data: offers,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getAllActiveAndExpiredOffers(
    tenant_id: number,
    langCode: string = 'en',
  ) {
    const language = await this.languageRepo.findOne({
      where: { code: langCode },
    });

    if (!language) {
      throw new BadRequestException('Invalid language code');
    }

    const allOffers = await this.offerRepository.find({
      where: {
        all_users: 1,
        status: ActiveStatus.ACTIVE,
        tenant_id,
        show_in_app: 1,
      },
      order: { created_at: 'DESC' },
    });

    const removeExtraFields = [
      'id',
      // 'uuid',
      'tenant_id',
      'business_unit_id',
      'external_system_id',
      'all_users',
      'created_by',
      'created_at',
      'updated_by',
      'updated_at',
      'business_unit',
      'language',
      'createdAt',
      'updatedAt',
      'createdBy',
      'updatedBy',
      'deletedAt',
    ];

    const today = new Date();
    const available = [];
    const expired = [];

    for (const eachOffer of allOffers) {
      const locale: any = eachOffer.locales.find(
        (loc) =>
          loc.language?.code === langCode || loc.language?.id === language?.id,
      );

      const filtered =
        locale?.benefits &&
        locale?.benefits?.map((b) => ({
          [`name_${langCode}`]: b[`name_${langCode}`],
          icon: b.icon,
        }));

      // We want uuid of the offer (eachOffer.uuid), not locale uuid
      const normalized = {
        ...locale,
        uuid: eachOffer.uuid, // force add/overwrite uuid to come from offer, not locale
        status: eachOffer.status,
        date_from: eachOffer.date_from,
        date_to: eachOffer.date_to,
        station_type: eachOffer.station_type,
        benefits: filtered || [],
        coupon_enabled: eachOffer.enable_coupons,
      };

      // Sort into available or expired
      if (eachOffer.date_to && new Date(eachOffer.date_to) < today) {
        expired.push(this.omitExtraFields(normalized, removeExtraFields));
      } else {
        available.push(this.omitExtraFields(normalized, removeExtraFields));
      }
    }

    return {
      success: true,
      message: 'Successfully fetched the data!',
      result: { available, expired },
      errors: [],
    };
  }

  /**
   * Get a single offer for a customer with coupon assignment
   *
   * This method retrieves an offer and handles coupon assignment logic based on the offer's coupon source type:
   * - For 'uploaded' coupons: Assigns a pre-uploaded coupon from the pool to the customer
   * - For 'auto-generated' coupons: Generates a unique coupon code on-the-fly for the customer
   *
   * @param tenant_id - UUID of the tenant
   * @param offer_id - UUID of the offer
   * @param customer_id - UUID of the customer
   * @param langCode - Language code for localization (e.g., 'en', 'ar')
   * @returns Offer details with assigned coupon code
   */
  async getSingleOffer({
    tenant_id,
    offer_id,
    customer_id,
    langCode,
  }: {
    tenant_id: string;
    offer_id: string;
    customer_id: string;
    langCode: string;
  }) {
    // Step 1: Validate tenant exists
    const tenant = await this.tenantRepository.findOne({
      where: { id: parseInt(tenant_id, 10) },
    });

    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    // Step 2: Validate customer exists and is active
    const customer = await this.customerRepo.findOne({
      where: { uuid: customer_id, status: 1 },
    });

    if (!customer) {
      throw new BadRequestException('Customer not found');
    }

    // Step 3: Validate language code and get language entity
    const language = await this.languageRepo.findOne({
      where: { code: langCode },
    });

    if (!language) {
      throw new BadRequestException('Invalid language code');
    }

    // Step 4: Find the offer by UUID, tenant, and ensure it's enabled for app display
    const offer = await this.offerRepository.findOne({
      where: {
        uuid: offer_id,
        tenant_id: tenant.id,
        show_in_app: 1,
      },
      relations: ['locales'],
    });

    if (!offer) {
      throw new BadRequestException('Offer not found');
    }

    const removeExtraFields = [
      'id',
      'tenant_id',
      'business_unit_id',
      'external_system_id',
      'all_users',
      'created_by',
      'created_at',
      'updated_by',
      'updated_at',
      'business_unit',
      'language',
      'createdAt',
      'updatedAt',
      'createdBy',
      'updatedBy',
      'deletedAt',
    ];

    let couponCode = null;

    // Step 5: Handle coupon assignment if coupons are enabled for this offer
    if (offer.enable_coupons === 1) {
      /**
       * Check if the customer already has a coupon assigned for this offer
       * This prevents duplicate assignments and ensures customers get the same coupon
       * on subsequent requests
       */
      const couponAssignment = await this.offerCouponAssignmentRepo.findOne({
        where: {
          offer_id: offer.id,
          customer_id: customer.id,
        },
      });

      if (couponAssignment) {
        // Customer already has a coupon assigned - return the existing one
        couponCode = couponAssignment.coupon_code;
      } else if (offer.coupon_source === 'uploaded') {
        /**
         * UPLOADED COUPON FLOW:
         * - Find the first available coupon from the pre-uploaded pool
         * - Coupons are uploaded in bulk during offer creation
         * - Each coupon can only be assigned to one customer
         * - Once assigned, status changes from 'AVAILABLE' to 'ASSIGNED'
         */
        const availableCoupon = await this.offerCouponAssignmentRepo.findOne({
          where: {
            offer_id: offer.id,
            status: 'AVAILABLE',
            customer_id: null, // Not yet assigned to any customer
          },
        });

        if (availableCoupon) {
          // Assign the coupon to this customer
          availableCoupon.customer_id = customer.id;
          availableCoupon.status = 'ASSIGNED';
          await this.offerCouponAssignmentRepo.save(availableCoupon);
          couponCode = availableCoupon.coupon_code;
        }
        // Note: If no available coupons found, couponCode remains null
        // This could happen if all pre-uploaded coupons have been assigned
      } else if (offer.coupon_source === 'auto-generated') {
        /**
         * AUTO-GENERATED COUPON FLOW:
         * - Generate a unique coupon code dynamically for this customer
         * - Each customer gets a unique code generated at the time of request
         * - No need for pre-uploading coupons
         * - Useful for unlimited coupon scenarios
         */
        const generatedCode = this.generateCouponCode();

        // Create a new coupon assignment record
        const newCoupon = this.offerCouponAssignmentRepo.create({
          offer: offer,
          offer_id: offer.id,
          coupon_code: generatedCode,
          customer_id: customer.id,
          status: 'ASSIGNED',
          coupon_source: 'auto-generated',
          is_used: false,
          is_expired: false,
        });

        const savedCoupon =
          await this.offerCouponAssignmentRepo.save(newCoupon);
        console.log(
          'New auto-generated coupon assigned:',
          savedCoupon.coupon_code,
        );
        couponCode = savedCoupon.coupon_code;

        console.log('new Generated couponCode', couponCode);
      }
    }

    // Step 6: Get the localized offer content based on language code
    const locale: any = offer.locales.find(
      (loc) =>
        loc.language?.code === langCode || loc.language?.id === language?.id,
    );

    // Step 7: Filter benefits to include only the localized name and icon
    const filteredBenefits =
      locale?.benefits &&
      locale?.benefits?.map((b) => ({
        [`name_${langCode}`]: b[`name_${langCode}`],
        icon: b.icon,
      }));

    // Step 8: Construct the normalized response object
    const normalized = {
      ...locale,
      status: offer.status,
      date_from: offer.date_from,
      date_to: offer.date_to,
      station_type: offer.station_type,
      benefits: filteredBenefits || [],
      coupon_code: couponCode ? couponCode : 'Not Available',
    };

    // Step 9: Return the offer with coupon code
    return {
      success: true,
      message: 'Successfully fetched the offer!',
      result: this.omitExtraFields(normalized, removeExtraFields),
      errors: [],
    };
  }

  async removeFile(fileUrl: string) {
    if (!fileUrl) {
      throw new BadRequestException('File URL is required');
    }

    const bucketName = process.env.OCI_BUCKET;
    await this.ociService.removeObjectFromOci(bucketName, fileUrl);
    return { message: `File removed successfully`, url: fileUrl };
  }

  omitExtraFields(input: any, extraOmit: string[] = []): any {
    const omitSet = new Set(extraOmit);
    const recurse = (value: any): any => {
      // Return nulls, Dates, or primitives directly
      if (
        value === null ||
        value instanceof Date ||
        typeof value !== 'object'
      ) {
        return value;
      }

      if (Array.isArray(value)) {
        return value.map(recurse);
      }

      const result: Record<string, any> = {};
      for (const [key, val] of Object.entries(value)) {
        if (!omitSet.has(key)) {
          result[key] = recurse(val);
        }
      }
      return result;
    };

    return recurse(input);
  }

  /**
   * Generate a random coupon code for auto-generated coupons
   *
   * This method creates a unique, URL-safe coupon code using UUID v4 as the entropy source.
   * The code is generated by:
   * 1. Creating a new UUID v4 (provides 122 bits of entropy)
   * 2. Removing hyphens to get a continuous hex string
   * 3. Taking the first 8 hex characters
   * 4. Splitting into 2 chunks of 4 characters each
   * 5. Converting each chunk from hex to base36 (0-9, a-z)
   * 6. Joining and taking the first 6 characters
   * 7. Converting to uppercase for better readability
   *
   * Example outputs: "APPF3K", "APP9XM", "APPB2H"
   *
   * Why this approach?
   * - UUID provides cryptographically strong randomness
   * - Base36 conversion creates alphanumeric codes (letters + numbers)
   * - Short length (6 chars) makes it easy to type and share
   * - Uppercase improves readability and avoids confusion with similar characters
   *
   * @returns A 6-character uppercase alphanumeric coupon code
   */
  private generateCouponCode(): string {
    const hex = uuidv4().replace(/-/g, '').slice(0, 8);
    const chunks = hex.match(/.{1,4}/g) || [];

    return chunks
      .map((part) => parseInt(part, 16).toString(36))
      .join('')
      .slice(0, 6)
      .toUpperCase();
  }
}
