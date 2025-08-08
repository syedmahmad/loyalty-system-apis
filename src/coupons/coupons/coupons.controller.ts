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
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as jwt from 'jsonwebtoken';
import { User } from 'src/users/entities/user.entity';
import { AuthTokenGuard } from 'src/users/guards/authTokenGuard';
import { Repository } from 'typeorm';
import { CreateCouponDto } from '../dto/create-coupon.dto';
import { UpdateCouponDto } from '../dto/update-coupon.dto';
import { CouponsService } from './coupons.service';

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

  @Get('/:client_id')
  async findAll(
    @Param('client_id') client_id: number,
    @Headers('user-secret') userSecret: string,
    @Query('name') name?: string, // optional query param,
    @Query('limit') limit?: number, // optional query param,
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

    return await this.service.findAll(client_id, name, limit, user.id);
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

  @Post('redeemCoupon')
  async redeemCoupon(@Body() bodyPayload: any) {
    return await this.service.redeemCoupon(bodyPayload);
  }
}
