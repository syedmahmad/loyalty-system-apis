import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { QrcodesService } from './qr_codes.service';

@Controller('qrcodes')
export class QrCodesController {
  constructor(private readonly service: QrcodesService) {}

  @Get('qr/:shortId')
  async showQr(@Param('shortId') shortId: string) {
    const mapping = await this.service.findOne(shortId);

    if (!mapping) {
      throw new NotFoundException('QR code not found');
    }

    return mapping;
  }
}
