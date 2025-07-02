import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Coupon } from '../entities/coupon.entity';
import { CreateCouponDto } from '../dto/create-coupon.dto';
import { UpdateCouponDto } from '../dto/update-coupon.dto';
import { RuleTarget } from '../../rules/entities/rule-target.entity'; // adjust path as needed
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';

@Injectable()
export class CouponsService {
  constructor(
    @InjectRepository(Coupon)
    private couponsRepository: Repository<Coupon>,
    @InjectRepository(RuleTarget)
    private ruleTargetRepository: Repository<RuleTarget>,
    @InjectRepository(BusinessUnit)
    private businessUnitRepository: Repository<BusinessUnit>, // adjust path as needed
  ) {}

  async create(dto: CreateCouponDto) {
    const coupon = this.couponsRepository.create(dto);
    const savedTier = await this.couponsRepository.save(coupon);
    return savedTier;
  }

  async findAll() {
    const coupons = await this.couponsRepository.find({
      relations: { business_unit: true },
      order: { created_at: 'DESC' },
    });

    return { coupons: coupons };
  }

  async findOne(id: number) {
    const coupon = await this.couponsRepository.findOne({
      where: { id },
      relations: { business_unit: true },
      order: { created_at: 'DESC' },
    });

    if (!coupon) throw new NotFoundException('Coupon not found');

    return coupon;
  }

  async update(id: number, dto: UpdateCouponDto) {
    const coupon = await this.findOne(id);

    if (dto.business_unit_id) {
      const bu = await this.businessUnitRepository.findOne({
        where: { id: dto.business_unit_id },
      });

      if (!bu) {
        throw new NotFoundException('Business Unit not found');
      }

      coupon.business_unit = bu;
    }

    Object.assign(coupon, dto);
    const updatedCoupon = await this.couponsRepository.save(coupon);
    return updatedCoupon;
  }

  async remove(id: number) {
    const coupon = await this.findOne(id);
    await this.couponsRepository.remove(coupon);
  }
}
