import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { DataSource, ILike, In, Not, Repository } from 'typeorm';

import { CreateCouponDto } from '../dto/create-coupon.dto';
import { UpdateCouponDto } from '../dto/update-coupon.dto';
import { Coupon } from '../entities/coupon.entity';
import { CustomerSegment } from 'src/customer-segment/entities/customer-segment.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { User } from 'src/users/entities/user.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { CouponCustomerSegment } from '../entities/coupon-customer-segments.entity';

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
    const hasGlobalAccess = privileges.some(
      (p) =>
        p.module === 'businessUnits' &&
        p.name === `${tenantName}_All Business Unit`,
    );

    const baseConditions = { status: Not(2), tenant_id: client_id };
    let whereClause = {};

    if (hasGlobalAccess) {
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
}
