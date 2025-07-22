import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { QrcodesService } from './qr_codes.service';

@Controller('qrcodes')
export class QrCodesController {
  constructor(private readonly service: QrcodesService) {}

  @Get('qr/:shortId')
  async showQr(@Param('shortId') shortId: string, @Res() res: Response) {
    const mapping = await this.service.findOne(shortId);

    if (!mapping) {
      throw new NotFoundException('QR code not found');
    }

    const base64 = mapping.qr_code_base64.replace(
      /^data:image\/png;base64,/,
      '',
    );
    const buffer = Buffer.from(base64, 'base64');

    res.setHeader('Content-Type', 'image/png');
    res.send(buffer);
  }
}
