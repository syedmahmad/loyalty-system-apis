import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { OciService } from 'src/oci/oci.service';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { User } from 'src/users/entities/user.entity';
import { DataSource, ILike, In, Not, Repository } from 'typeorm';
import { CreateOfferDto, UpdateOfferDto } from '../dto/offers.dto';
import { OffersEntity } from '../entities/offers.entity';

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

    @InjectDataSource()
    private readonly dataSource: DataSource,

    private readonly ociService: OciService,
  ) {}

  async create(dto: CreateOfferDto, user: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      queryRunner.data = { user };
      const repo = queryRunner.manager.getRepository(OffersEntity);
      const offer = repo.create(dto);
      const savedOffer = await repo.save(offer);
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
    isCallingFromAdminPanel: boolean = false,
    langCode: string = 'en',
  ) {
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
        p.module === 'businessUnits' &&
        p.name === `${tenantName}_All Business Unit`,
    );

    const baseConditions = {
      status: Not(2),
      tenant_id: client_id,
      ...(business_unit_id &&
      typeof business_unit_id === 'string' &&
      business_unit_id !== '1'
        ? { business_unit_id }
        : {}),
    };
    let whereClause = {};

    const removeExtraFields = isCallingFromAdminPanel
      ? ['id']
      : [
          'id',
          'uuid',
          'tenant_id',
          'business_unit_id',
          'external_system_id',
          'all_users',
          'created_by',
          'created_at',
          'updated_by',
          'updated_at',
          'business_unit',
        ];

    // Language-specific field removal
    if (langCode === 'en') {
      removeExtraFields.push(
        'offer_title_ar',
        'description_ar',
        'terms_and_conditions_ar',
        'name_ar',
        'ar',
      );
    } else if (langCode === 'ar') {
      removeExtraFields.push(
        'offer_title',
        'description_en',
        'terms_and_conditions_en',
        'name_en',
        'en',
      );
    }

    if (hasGlobalAccess || isSuperAdmin) {
      whereClause = name
        ? [
            { ...baseConditions, code: ILike(`%${name}%`) },
            { ...baseConditions, offer_title: ILike(`%${name}%`) },
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

      const [data, total] = await this.offerRepository.findAndCount({
        where: {
          ...whereClause,
          ...(business_unit_id &&
          typeof business_unit_id === 'string' &&
          business_unit_id !== '1'
            ? { business_unit_id: business_unit_id }
            : { business_unit: In(availableBusinessUnitIds) }),
        },
        relations: { business_unit: true },
        order: { created_at: 'DESC' },
        take,
        skip,
      });

      // const offers = this.omitExtraFields(data);
      const offers = this.omitExtraFields(data, removeExtraFields);
      return {
        data: offers,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    }

    const [data, total] = await this.offerRepository.findAndCount({
      where: whereClause,
      relations: ['business_unit'],
      order: { created_at: 'DESC' },
      take,
      skip,
    });
    // const offers = this.omitExtraFields(data);
    const offers = this.omitExtraFields(data, removeExtraFields);
    return {
      data: offers,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(
    id: number,
    isCallingFromAdminPanel: boolean = false,
    langCode: string = 'en',
  ) {
    const offer = await this.offerRepository.findOne({
      where: { id },
      relations: ['business_unit'],
      order: { created_at: 'DESC' },
    });

    if (!offer) throw new NotFoundException('Offer not found');

    const removeExtraFields = isCallingFromAdminPanel
      ? ['id']
      : [
          'id',
          'uuid',
          'tenant_id',
          'business_unit_id',
          'external_system_id',
          'all_users',
          'created_by',
          'created_at',
          'updated_by',
          'updated_at',
          'business_unit',
        ];

    // Language-specific field removal
    if (langCode === 'en') {
      removeExtraFields.push(
        'offer_title_ar',
        'description_ar',
        'terms_and_conditions_ar',
        'name_ar',
        'ar',
      );
    } else if (langCode === 'ar') {
      removeExtraFields.push(
        'offer_title',
        'description_en',
        'terms_and_conditions_en',
        'name_en',
        'en',
      );
    }

    const offers = this.omitExtraFields(offer, removeExtraFields);
    return offers;
  }

  async remove(id: number, user: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      queryRunner.data = { user };
      const repo = queryRunner.manager.getRepository(OffersEntity);
      const offer = await repo.findOne({ where: { id } });
      if (!offer) throw new Error(`Offer with id ${id} not found`);
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

  async update(id: number, dto: UpdateOfferDto, user: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      queryRunner.data = { user };
      const repo = queryRunner.manager.getRepository(OffersEntity);
      const offer = await repo.findOne({ where: { id } });

      if (!offer) throw new Error(`Offer with id ${id} not found`);
      repo.merge(offer, dto);
      await repo.save(offer);
      await queryRunner.commitTransaction();

      return await this.findOne(id);
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
}
