import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CouponType } from '../entities/coupon_type.entity';
import { CreateCouponTypeDto } from '../dto/create-coupon-type.dto';
import { UpdateCouponTypeDto } from '../dto/update-coupon-type.dto';
import { ActiveStatus } from '../type/types';

@Injectable()
export class CouponTypeService {
  constructor(
    @InjectRepository(CouponType)
    private couponTypeRepository: Repository<CouponType>,
  ) {}

  async create(dto: CreateCouponTypeDto) {
    const coupon = this.couponTypeRepository.create(dto);
    const savedTier = await this.couponTypeRepository.save(coupon);
    return savedTier;
  }

  async findAll() {
    const couponTypes = await this.couponTypeRepository.find({
      where: { is_active: ActiveStatus.ACTIVE },
      order: { created_at: 'DESC' },
    });

    return { couponTypes: couponTypes };
  }

  async findOne(id: number) {
    const coupon = await this.couponTypeRepository.findOne({
      where: { id },
      order: { created_at: 'DESC' },
    });

    if (!coupon) throw new NotFoundException('CouponType not found');

    return coupon;
  }

  async update(id: number, dto: UpdateCouponTypeDto) {
    console.log('dto ::', dto);
    const coupon = await this.findOne(id);
    const updatedCoupon = await this.couponTypeRepository.save(coupon);
    return updatedCoupon;
  }

  async remove(id: number) {
    const coupon = await this.findOne(id);
    await this.couponTypeRepository.remove(coupon);
  }
}
