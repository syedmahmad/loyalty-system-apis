import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RestyInvoicesInfo } from './entities/resty_invoices_info.entity';
import { RestyInvoicesInfoController } from './resty-invoice-info/resty_invoices_info.controller';
import { RestyInvoicesInfoService } from './resty-invoice-info/resty_invoices_info.service';

@Module({
  imports: [TypeOrmModule.forFeature([RestyInvoicesInfo])],
  controllers: [RestyInvoicesInfoController],
  providers: [RestyInvoicesInfoService],
})
export class RestyInvoicesInfoModule {}
