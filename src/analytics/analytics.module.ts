import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { WalletTransaction } from 'src/wallet/entities/wallet-transaction.entity';
import { WalletOrder } from 'src/wallet/entities/wallet-order.entity';
import { LoyaltyAnalyticsController } from './analytics/analytics.controller';
import { LoyaltyAnalyticsService } from './analytics/analytics.service';
import { Coupon } from 'src/coupons/entities/coupon.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { User } from 'src/users/entities/user.entity';
import { UserCoupon } from 'src/wallet/entities/user-coupon.entity';
import { CouponUsage } from 'src/coupons/entities/coupon-usages.entity';
import { RestyInvoicesInfo } from 'src/petromin-it/resty/entities/resty_invoices_info.entity';
import { Rule } from 'src/rules/entities/rules.entity';
import { Customer } from 'src/customers/entities/customer.entity';
import { QitafTransaction } from 'src/qitaf/entities/qitaf-transaction.entity';
import { TenantPartnerIntegration } from 'src/tenant-integrations/entities/tenant-partner-integration.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Wallet,
      WalletTransaction,
      WalletOrder,
      Coupon,
      Tenant,
      BusinessUnit,
      User,
      UserCoupon,
      CouponUsage,
      RestyInvoicesInfo,
      Rule,
      Customer,
      QitafTransaction,
      TenantPartnerIntegration,
    ]),
  ],
  controllers: [LoyaltyAnalyticsController],
  providers: [LoyaltyAnalyticsService],
})
export class LoyaltyAnalyticsModule {}
