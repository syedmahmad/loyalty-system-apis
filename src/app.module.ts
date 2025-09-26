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
import { GateWayLogModule } from './gateway-logs/log.module';
import { decrypt } from './utils/decrypt';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerModule } from './schedule/schedule.module';
import { OpenaiModule } from './openai/openai.module';
import { AuthModule } from 'src/petromin-it/auth/auth.module';
import { AxiosLoggerInterceptor } from 'src/interceptos/axios-request-log.interceptor';
import { HttpModule } from '@nestjs/axios';
import { CustomerProfileModule } from './petromin-it/profile/profile.module';
import { ReferralModule } from './petromin-it/referral/referral.module';
import { BurningModule } from './petromin-it/burning/burning.module';
import { VehicleModule } from './vehicles/vehicles.module';
import { MakeModule } from './make/make.module';
import { ModelModule } from './model/model.module';
import { VariantModule } from './variant/variant.module';
import { PreferencesModule } from './petromin-it/preferences/preferences.module';
import { NotificationModule } from 'src/petromin-it/notification/notification.module';
import { RestyInvoicesInfoModule } from './petromin-it/resty-invoice-info/resty_invoices_info.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [],
      useFactory: async () => {
        const host = await decrypt(process.env.DB_HOST || '');
        const port = parseInt(await decrypt(process.env.DB_PORT || ''), 10);
        const username = await decrypt(process.env.DB_USERNAME || '');
        const password = await decrypt(process.env.DB_PASSWORD || '');
        const database = await decrypt(process.env.DB_NAME || '');

        return {
          type: 'mysql',
          host,
          port,
          username,
          password,
          database,
          autoLoadEntities: true,
          synchronize: true,
          subscribers: [GlobalAuditSubscriber],
        };
      },
    }),
    ScheduleModule.forRoot(),
    UsersModule,
    CampaignModule,
    CustomerModule,
    BusinessUnitsModule,
    GateWayLogModule,
    RewardsModule,
    PointsModule,
    TiersModule,
    LogModule,
    CustomerProfileModule,
    HttpModule,
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
    SchedulerModule,
    OpenaiModule,
    RestyInvoicesInfoModule,
    AuthModule,
    ReferralModule,
    BurningModule,
    VehicleModule,
    MakeModule,
    ModelModule,
    VariantModule,
    PreferencesModule,
    NotificationModule,
  ],
  controllers: [AppController],
  providers: [AppService, AxiosLoggerInterceptor],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LogVaultMiddleware).forRoutes('*');
  }
}
