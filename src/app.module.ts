import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
// import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { RewardsModule } from './rewards/rewards.module';
import { PointsModule } from './points/points.module';
import { TiersModule } from './tiers/tiers.module';
import { TenantsModule } from './tenants/tenants.module';
import { ReportsModule } from './reports/reports.module';
import { CustomerModule } from './customers/customer.module';
import { BusinessUnitsModule } from './business_unit/business_unit.module';
import { RulesModule } from './rules/rules.module';
import { CampaignModule } from './campaigns/campaigns.module';
import { LogVaultMiddleware } from './middleware/log-vault.middleware';
import { LogModule } from './logs/log.module';
import { GlobalAuditSubscriber } from './audit_tails/audit_trail/audit_trail.subscriber';
import { AuditTrailModule } from './audit_tails/audit_trail.module';
import { CouponsModule } from './coupons/coupons.module';
import { CouponTypeModule } from './coupon_type/coupon_type.module';
import { WalletModule } from './wallet/wallet.module';
import { OciModule } from './oci/oci.module';
import { CustomerSegmentsModule } from './customer-segment/customer-segment.module';
import { QrCodesModule } from './qr_codes/qr_codes.module';
import { LoyaltyAnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST,
      port: +process.env.DB_PORT,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      autoLoadEntities: true,
      synchronize: true,
      subscribers: [GlobalAuditSubscriber],
    }),
    UsersModule,
    CampaignModule,
    CustomerModule,
    BusinessUnitsModule,
    RewardsModule,
    PointsModule,
    TiersModule,
    LogModule,
    AuditTrailModule,
    TenantsModule,
    ReportsModule,
    RulesModule,
    LoyaltyAnalyticsModule,
    CouponsModule,
    CouponTypeModule,
    WalletModule,
    OciModule,
    CustomerSegmentsModule,
    QrCodesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LogVaultMiddleware).forRoutes('*');
  }
}
