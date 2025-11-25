import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import * as jwt from 'jsonwebtoken';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { User } from 'src/users/entities/user.entity';
import { AuthTokenGuard } from 'src/users/guards/authTokenGuard';
import { Repository } from 'typeorm';
import { CouponSyncDto } from '../dto/coupon-sync.dto';
import { CreateCouponDto } from '../dto/create-coupon.dto';
import { CustomerCouponsDto } from '../dto/customer-coupon.dto';
import { UpdateCouponDto } from '../dto/update-coupon.dto';
import { CouponsService } from './coupons.service';
import { ValidateCouponDto } from '../dto/validate-coupon.dto';
import { getCouponCriteriasDto } from '../dto/coupon.dto';

@Controller('coupons')
export class CouponsController {
  constructor(
    private readonly service: CouponsService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  @UseGuards(AuthTokenGuard)
  @Post()
  async create(
    @Body() dto: CreateCouponDto,
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
    return await this.service.create(dto, user.uuid);
  }

  @Get('/check-existing-code')
  async checkExistingCode(@Query('code') code: string) {
    return await this.service.checkExistingCode(code);
  }

  @Get('/:client_id')
  async findAll(
    @Param('client_id') client_id: number,
    @Headers('user-secret') userSecret: string,
    @Query('name') name?: string, // optional query param,
    @Query('bu') bu?: number, // optional query param,
    @Query('limit') limit?: number, // optional query param,
    @Query('page') page?: number, // optional query param,
    @Query('pageSize') pageSize?: number, // optional query param,
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

    return await this.service.findAll(
      client_id,
      name,
      limit,
      user.id,
      bu,
      page,
      pageSize,
    );
  }

  @Get('/third-party/:tenant_id')
  async findAllForThirdParty(
    @Param('tenant_id') tenant_id: string,
    @Query('name') name?: string, // optional query param,
    @Query('limit') limit?: number, // optional query param,
  ) {
    return await this.service.findAllThirdParty(tenant_id, name, limit);
  }

  @Get('edit/:id')
  async findOne(@Param('id') id: string) {
    return await this.service.findOne(+id);
  }

  @UseGuards(AuthTokenGuard)
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Headers('user-secret') userSecret: string,
    @Body() dto: UpdateCouponDto,
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

  @UseGuards(AuthTokenGuard)
  @Delete(':id')
  async remove(
    @Param('id') id: string,
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
    return await this.service.remove(+id, user.uuid);
  }

  @Get('vehicle/makes')
  async findMakes() {
    return await this.service.findMakes();
  }

  @Get('vehicle/models')
  async findModels(
    @Query('makeId') makeId?: number,
    @Query('year') year?: number,
  ) {
    return await this.service.findModels(makeId, year);
  }

  @Get('vehicle/variants/:modelId')
  async findVariants(@Param('modelId') modelId: string) {
    return await this.service.findVariants(modelId);
  }

  @Post('redeem')
  async redeemCoupon(@Body() bodyPayload: any) {
    return await this.service.redeem(bodyPayload);
  }

  @Post('earn')
  async earnCoupon(@Body() body: any) {
    return this.service.earnCoupon(body);
  }

  @Post('customer')
  async getCustomerCoupons(
    @Body() body: CustomerCouponsDto,
    @Query('language_code') language_code: string,
  ) {
    return await this.service.getCustomerCoupons(body, language_code);
  }

  @Post('sync')
  async syncCoupons(@Body() body: CouponSyncDto) {
    return await this.service.syncCoupons(body);
  }

  @UseGuards(AuthTokenGuard)
  @Post('upload')
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
  async uploadFile(
    @UploadedFile() file: any,
    @Body('') body: CreateCouponDto,
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

    return this.service.importFromCsv(file.path, body, user.uuid);
  }

  @Post('assigned-coupons')
  async getCustomerAssignedCoupons(
    @Body() body: CustomerCouponsDto,
    @Query('search') search?: string,
  ) {
    return await this.service.getCustomerAssignedCoupons(body, search);
  }

  @Post('used-history')
  async getCouponUsedHistory(
    @Body() body: any,
    @Query('search') search?: string,
  ) {
    return await this.service.getCouponUsedHistory(body, search);
  }

  @Post('upload-image-to-bucket')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFileToBucket(@UploadedFile() file: any) {
    const bucketName = process.env.OCI_BUCKET;
    const objectName = file.originalname;
    const buffer = file.buffer;

    const response = await this.service.uploadFileToBucket(
      buffer,
      bucketName,
      objectName,
    );

    if (response) {
      return {
        success: true,
        message: 'File uploaded successfully',
        uploaded_url: `${process.env.OCI_URL}/${objectName}`,
      };
    }

    return {
      success: false,
      message: 'Failed to upload file',
    };
  }

  @Post('coupon-criteria')
  async getCouponCriterias(@Body() body: getCouponCriteriasDto) {
    return await this.service.getCouponCriterias(body);
  }

  @Post('validate-coupon')
  async validateCoupon(@Body() body: ValidateCouponDto) {
    return await this.service.validateCoupon(body);
  }
}
