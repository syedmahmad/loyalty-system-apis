import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { CustomerService } from './customer.service';
import { BulkCreateCustomerDto } from './dto/create-customer.dto';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/users/entities/user.entity';

@Controller('customers')
export class CustomerController {
  constructor(
    private readonly customerService: CustomerService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

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

  @Get(':id/details')
  async getCustomerWithWallet(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.customerService.getCustomerWithWalletAndTransactions(
      req,
      id,
      page,
      pageSize,
    );
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
