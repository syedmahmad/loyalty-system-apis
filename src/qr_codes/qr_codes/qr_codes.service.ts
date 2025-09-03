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
      /** Reason: If customer already persent but his QR is not generated ,
        then we dont know his shortId. In that case we are checking by customer_id inside qr_codes table, 
        if that customer_id not present then creating QR for the customer.
      */
      where: [{ short_id: shortId }, { customer: { id: shortId } }],
    });
    return mapping;
  }
}
