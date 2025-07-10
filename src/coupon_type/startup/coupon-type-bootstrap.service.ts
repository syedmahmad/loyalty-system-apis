// coupon_type/startup/coupon-type-bootstrap.service.ts
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CouponType } from '../entities/coupon_type.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';

@Injectable()
export class CouponTypeBootstrapService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(CouponType)
    private readonly couponTypeRepo: Repository<CouponType>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  async onApplicationBootstrap() {
    const couponTypes = [
      'VEHICLE_SPECIFIC',
      'USER_SPECIFIC',
      'TIME_LIMITED',
      'PRODUCT_SPECIFIC',
      'GEO_TARGETED',
      'USAGE_BASED',
      'BIRTHDAY',
      'REFERRAL',
      'TIER_BASED',
      'CASHBACK',
      'DISCOUNT',
    ];

    const conditions = {
      VEHICLE_SPECIFIC: [
        { name: 'fuel_type' },
        { name: 'color' },
        { name: 'Cylinder' },
        { name: 'body_type' },
      ],
      USER_SPECIFIC: [
        { name: 'EMAIL_DOMAIN' },
        { name: 'EMAIL' },
        { name: 'PHONE_NUMBER' },
        { name: 'NOT_APPLICABLE' },
        { name: 'VALIDATE_OTP' },
      ],
      TIME_LIMITED: [{ name: 'minimumPurchase' }],
      PRODUCT_SPECIFIC: [{ name: 'applicableProductIds' }],
      GEO_TARGETED: [{ name: 'allowedCities' }, { name: 'allowedZipCodes' }],
      USAGE_BASED: [{ name: 'requiredUsageCount' }],
      BIRTHDAY: [
        { name: 'minimumPurchase' },
        { name: 'userMustVerifyBirthday' },
        { name: 'validOnCategories' },
      ],
      REFERRAL: [
        { name: 'referredUserFirstPurchaseMinAmount' },
        { name: 'referredUserSignupRequired' },
        { name: 'referralDiscount' },
        { name: 'referrerReward' },
      ],
      TIER_BASED: [{ name: 'discountPercentage' }],
      CASHBACK: [{ name: 'minPurchaseAmount' }],
      DISCOUNT: [{ name: 'minPurchaseAmount' }],
    };

    const existing = await this.couponTypeRepo.findOne({
      where: {
        coupon_type: In(couponTypes),
      },
    });

    if (!existing) {
      const existingTenant = await this.tenantRepo.find();
      const tenantId = existingTenant[0].id;

      const now = new Date();

      const defaultCouponTypes = couponTypes.map((type) =>
        this.couponTypeRepo.create({
          tenant_id: tenantId,
          coupon_type: type,
          is_active: 1,
          conditions: conditions[type] || [],
          created_at: now,
          updated_at: now,
        }),
      );
      await this.couponTypeRepo.save(defaultCouponTypes);
      console.log('✅ Default Coupon Type created');
    } else {
      console.log('ℹ️ Default Coupon Type already exists');
    }
  }
}
