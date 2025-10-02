import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { User } from 'src/users/entities/user.entity';
import { Repository } from 'typeorm';
import { CustomerService } from './customer.service';
import { CreateCustomerActivityDto } from './dto/create-customer-activity.dto';
import { BulkCreateCustomerDto } from './dto/create-customer.dto';
import { CustomerEarnDto } from './dto/customer-earn.dto';
import { EarnWithEvent } from 'src/customers/dto/earn-with-event.dto';
import { BurnWithEvent } from 'src/customers/dto/burn-with-event.dto';
import { GvrEarnBurnWithEventsDto } from 'src/customers/dto/gvr_earn_burn_with_event.dto';
import { CustomerDto } from './dto/customer.dto';
import { CustomerEarnHistoryDto } from './dto/customer-earn-history.dto';
import { FileInterceptor } from '@nestjs/platform-express';

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

  @Get(':client_id')
  async getAllCustomers(
    @Param('client_id') client_id: number,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('search') search?: string,
  ) {
    return this.customerService.getAllCustomers(
      client_id,
      page,
      pageSize,
      search,
    );
  }

  @Get(':id')
  async getCustomerById(@Param('id') id: number) {
    return this.customerService.getCustomerById(id);
  }

  @Get(':id/details')
  async getCustomerWithWallet(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Query('pointPage') pointPage?: number,
    @Query('couponPage') couponPage?: number,
    @Query('pageSize') pageSize?: number,
    @Query('point-search-query') pointQuery?: string,
    @Query('coupon-search-query') couponQuery?: string,
  ) {
    return this.customerService.getCustomerWithWalletAndTransactions(
      req,
      id,
      pointPage,
      couponPage,
      pageSize,
      pointQuery,
      couponQuery,
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

  @Post('/activity')
  async createCustomerActivity(@Body() body: CreateCustomerActivityDto) {
    return this.customerService.createCustomerActivity(body);
  }

  @Post('earn')
  async earnPoints(@Body() body: CustomerEarnDto) {
    return this.customerService.earnPoints(body);
  }

  @Post('earn_with_event')
  async earnWithEvent(@Body() body: EarnWithEvent) {
    return this.customerService.earnWithEvent(body);
  }

  @Post('burn_with_event')
  async BurnWithEvent(@Body() body: BurnWithEvent) {
    return this.customerService.burnWithEvent(body);
  }

  @Get('/validate-customer-tenant/:customerId/:tenantId')
  async validateCustomerTenant(
    @Param('customerId') customerId: string,
    @Param('tenantId') tenantId: number,
  ) {
    return this.customerService.validateCustomerTenant(customerId, tenantId);
  }

  @Post('gvr_earn_with_event')
  async gvrEarnWithEvent(@Body() body: GvrEarnBurnWithEventsDto) {
    return this.customerService.gvrEarnWithEvent(body);
  }

  @Post('gvr_burn_with_event')
  async gvrBurnWithEvent(@Body() body: GvrEarnBurnWithEventsDto) {
    return this.customerService.gvrBurnWithEvent(body);
  }

  @Post('/info')
  async customerInfo(@Req() req: Request, @Body() body: CustomerDto) {
    return this.customerService.customerInfo(req, body);
  }

  @Post('/burn-transaction')
  async burnTransaction(@Body() body: any) {
    return this.customerService.burnTransaction(body);
  }

  @Post('/earn-history')
  async earnHistory(
    @Body() body: CustomerEarnHistoryDto,
    @Query('page') page: number,
    @Query('pageSize') pageSize: number,
    @Query('language_code') language_code: string,
  ) {
    return this.customerService.earnHistory(
      body,
      page,
      pageSize,
      language_code,
    );
  }

  @Post('/burn-history')
  async burnHistory(
    @Body() body: CustomerEarnHistoryDto,
    @Query('page') page: number,
    @Query('pageSize') pageSize: number,
    @Query('language_code') language_code: string,
  ) {
    return this.customerService.burnHistory(
      body,
      page,
      pageSize,
      language_code,
    );
  }

  @Post('/transaction-history')
  async transactionHistory(
    @Body() body: CustomerEarnHistoryDto,
    @Query('page') page: number,
    @Query('pageSize') pageSize: number,
    @Query('language_code') language_code: string,
  ) {
    return this.customerService.transactionHistory(
      body,
      page,
      pageSize,
      language_code,
    );
  }

  @Post('upload-profile-image/:customerId')
  @UseInterceptors(FileInterceptor('file'))
  async uploadProfileImage(
    @Param('customerId') customerId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    try {
      const bucketName = process.env.OCI_BUCKET;
      const objectName = file.originalname;
      const buffer = file.buffer;

      const response = await this.customerService.uploadProfileImage(
        customerId,
        buffer,
        bucketName,
        objectName,
      );

      if (response) {
        return {
          success: true,
          message: 'Profile image uploaded successfully',
          uploaded_url: `${process.env.OCI_URL}/${objectName}`,
        };
      }

      return {
        success: false,
        message: 'Failed to upload file',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }
}
