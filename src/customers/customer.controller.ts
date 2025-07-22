import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
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

  @Get()
  async getAllCustomers(@Query('search') search?: string) {
    return this.customerService.getAllCustomers(search);
  }

  @Get(':id')
  async getCustomerById(@Param('id') id: number) {
    return this.customerService.getCustomerById(id);
  }

  @Patch(':id/status')
  async updateStatus(@Param('id') id: number, @Body() body: { status: 0 | 1 }) {
    return this.customerService.updateStatus(id, body.status);
  }

  @Get('/single/:uuid')
  async getCustomerByUuid(@Req() req: Request, @Param('uuid') uuid: string) {
    return this.customerService.getCustomerByUuid(req, uuid);
  }
}
