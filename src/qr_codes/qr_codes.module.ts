import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QrcodesService } from './qr_codes/qr_codes.service';
import { QrCodesController } from './qr_codes/qr_codes.controller';
import { QrCode } from './entities/qr_code.entity';

@Module({
  imports: [TypeOrmModule.forFeature([QrCode])],
  controllers: [QrCodesController],
  providers: [QrcodesService],
})
export class QrCodesModule {}
