import { Body, Controller, Post } from '@nestjs/common';
import { RestyInvoicesInfoService } from './resty_invoices_info.service';
import { CreateRestyInvoicesInfoDto } from '../dto/resty_invoices_info.dto';

@Controller('resty-invoices')
export class RestyInvoicesInfoController {
  constructor(
    private readonly restyInvoicesService: RestyInvoicesInfoService,
  ) {}

  @Post()
  async create(@Body() body: CreateRestyInvoicesInfoDto) {
    return this.restyInvoicesService.create(body);
  }
}
