import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QrCode } from '../entities/qr_code.entity';

@Injectable()
export class QrcodesService {
  constructor(
    @InjectRepository(QrCode)
    private qrcodesRepository: Repository<QrCode>,
  ) {}

  async findOne(shortId) {
    const mapping = await this.qrcodesRepository.findOne({
      where: [{ short_id: shortId }, { customer: { id: shortId } }],
    });
    return mapping;
  }
}
