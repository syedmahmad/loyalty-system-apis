import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from 'src/petromin-it/auth/auth/auth.controller';
import { AuthService } from 'src/petromin-it/auth/auth/auth.service';
import { Customer } from 'src/customers/entities/customer.entity';
import { OciService } from 'src/oci/oci.service';
import { CustomerModule } from 'src/customers/customer.module';
import { QrCode } from 'src/qr_codes/entities/qr_code.entity';
import { QrcodesService } from 'src/qr_codes/qr_codes/qr_codes.service';
import { Log } from 'src/logs/entities/log.entity';
import { WalletModule } from 'src/wallet/wallet.module';
import { Referral } from 'src/wallet/entities/referrals.entity';
import { VehicleModule } from 'src/vehicles/vehicles.module';
import { RestyCustomerProfileSelection } from 'src/customers/entities/resty_customer_profile_selection.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      QrCode,
      Log,
      Referral,
      RestyCustomerProfileSelection,
    ]),
    CustomerModule,
    WalletModule,
    forwardRef(() => VehicleModule),
  ],
  controllers: [AuthController],
  providers: [AuthService, QrcodesService, OciService],
  exports: [AuthService],
})
export class AuthModule {}
