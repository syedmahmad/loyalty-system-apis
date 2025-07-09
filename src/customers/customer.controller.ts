import { Body, Controller, Post, Req } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { BulkCreateCustomerDto } from './dto/create-customer.dto';
import { Request } from 'express';

@Controller('customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Post()
  async create(@Req() req: Request, @Body() dto: BulkCreateCustomerDto) {
    return this.customerService.createCustomer(req, dto);
  }
}
