// customer-segments.controller.ts

import {
  Controller,
  Get,
  Headers,
  Post,
  Body,
  Param,
  Put,
  UseGuards,
  BadRequestException,
  Delete,
  Query,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { AuthTokenGuard } from 'src/users/guards/authTokenGuard';
import * as jwt from 'jsonwebtoken';
import { User } from 'src/users/entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCustomerSegmentDto } from '../dto/create.dto';
import { CustomerSegmentsService } from './customer-segment.service';
import { UpdateCustomerSegmentDto } from '../dto/update-customer-segment.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('customer-segments')
export class CustomerSegmentsController {
  constructor(
    private readonly service: CustomerSegmentsService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  @UseGuards(AuthTokenGuard)
  @Post()
  async create(
    @Body() dto: CreateCustomerSegmentDto,
    @Headers('user-secret') userSecret: string,
  ) {
    if (!userSecret)
      throw new BadRequestException('user-secret not found in headers');

    const decodedUser: any = jwt.decode(userSecret);
    const user = await this.userRepository.findOne({
      where: { id: decodedUser.UserId },
    });
    if (!user)
      throw new BadRequestException('user not found against provided token');

    return await this.service.create(dto, user.uuid);
  }

  @Get(':client_id')
  async findAll(
    @Param('client_id') client_id: number,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('name') name?: string,
  ) {
    return await this.service.findAll(client_id, page, pageSize, name);
  }

  @Get('view-customers/:segment_id')
  async viewCustomers(@Param('segment_id') segmentId: number) {
    return await this.service.getCustomers(segmentId);
  }

  @UseGuards(AuthTokenGuard)
  @Put('add-customer/:segment_id')
  async addCustomer(
    @Param('segment_id') segmentId: number,
    @Body('customer_id') customerId: number,
    @Headers('user-secret') userSecret: string,
  ) {
    if (!userSecret)
      throw new BadRequestException('user-secret not found in headers');

    const decodedUser: any = jwt.decode(userSecret);
    const user = await this.userRepository.findOne({
      where: { id: decodedUser.UserId },
    });
    if (!user)
      throw new BadRequestException('user not found against provided token');

    return await this.service.addCustomerToSegment(segmentId, customerId);
  }

  @UseGuards(AuthTokenGuard)
  @Put('remove-customer/:segment_id')
  async removeCustomer(
    @Param('segment_id') segmentId: number,
    @Body('customer_id') customerId: number,
    @Headers('user-secret') userSecret: string,
  ) {
    if (!userSecret)
      throw new BadRequestException('user-secret not found in headers');

    const decodedUser: any = jwt.decode(userSecret);
    const user = await this.userRepository.findOne({
      where: { id: decodedUser.UserId },
    });
    if (!user)
      throw new BadRequestException('user not found against provided token');

    return await this.service.removeCustomerFromSegment(segmentId, customerId);
  }

  @Delete(':segment_id/delete')
  async deactivateSegment(
    @Param('segment_id') segmentId: number,
    @Headers('user-secret') userSecret: string,
  ) {
    if (!userSecret)
      throw new BadRequestException('user-secret not found in headers');

    const decodedUser: any = jwt.decode(userSecret);
    const user = await this.userRepository.findOne({
      where: { id: decodedUser.UserId },
    });
    if (!user)
      throw new BadRequestException('user not found against provided token');

    return this.service.remove(segmentId, user.uuid);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Headers('user-secret') userSecret: string,
    @Body() dto: UpdateCustomerSegmentDto,
  ) {
    if (!userSecret) {
      throw new BadRequestException('user-secret not found in headers');
    }

    const decodedUser: any = jwt.decode(userSecret);

    const user = await this.userRepository.findOne({
      where: {
        id: decodedUser.UserId,
      },
    });

    if (!user) {
      throw new BadRequestException('user not found against provided token');
    }

    return await this.service.update(+id, dto, user.uuid);
  }

  @Post('bulk-upload')
  // @UseInterceptors(FileInterceptor('file'))
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads', // make sure folder exists
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(
            null,
            file.fieldname + '-' + uniqueSuffix + extname(file.originalname),
          );
        },
      }),
    }),
  )
  async bulkUpload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Headers('user-secret') userSecret: string,
  ) {
    if (!userSecret) {
      throw new BadRequestException('user-secret not found in headers');
    }
    const decodedUser: any = jwt.decode(userSecret);

    const user = await this.userRepository.findOne({
      where: {
        id: decodedUser.UserId,
      },
    });

    if (!user) {
      throw new BadRequestException('user not found against provided token');
    }

    if (!file) {
      throw new BadRequestException('File not uploaded');
    }

    return this.service.bulkUpload(file.path, body, user.uuid);
  }
}
