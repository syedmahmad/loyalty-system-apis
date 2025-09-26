import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RestyInvoicesInfo } from '../entities/resty_invoices_info.entity';
import { CreateRestyInvoicesInfoDto } from '../dto/resty_invoices_info.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RestyInvoicesInfoService {
  constructor(
    @InjectRepository(RestyInvoicesInfo)
    private readonly restyInvoicesRepo: Repository<RestyInvoicesInfo>,
  ) {}

  async create(data: CreateRestyInvoicesInfoDto): Promise<RestyInvoicesInfo> {
    const newInvoice = this.restyInvoicesRepo.create({
      ...data,
      uuid: uuidv4(),
    });
    return this.restyInvoicesRepo.save(newInvoice);
  }
}
