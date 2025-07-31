import {
  Controller,
  Get,
  Headers,
  Post,
  Body,
  Param,
  Delete,
  Put,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { TiersService } from './tiers.service';
import { CreateTierDto } from '../dto/create-tier.dto';
import { UpdateTierDto } from '../dto/update-tier.dto';
import { AuthTokenGuard } from 'src/users/guards/authTokenGuard';
import * as jwt from 'jsonwebtoken';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { Repository } from 'typeorm';

@Controller('tiers')
export class TiersController {
  constructor(
    private readonly service: TiersService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  @UseGuards(AuthTokenGuard)
  @Post()
  async create(
    @Body() dto: CreateTierDto,
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

  @Get(':client_id')
  async findAll(
    @Param('client_id') client_id: number,
    @Headers('user-secret') userSecret: string,
    @Query('name') name?: string, // optional query param
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

    return await this.service.findAll(client_id, name, user.id);
  }

  @Get('/single/:id')
  async findOne(@Param('id') id: string) {
    return await this.service.findOne(+id);
  }

  @UseGuards(AuthTokenGuard)
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Headers('user-secret') userSecret: string,
    @Body() dto: UpdateTierDto,
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

  @Get(':client_id/benefits')
  async getAllTierBenefits(@Param('client_id') client_id: string) {
    return await this.service.getAllTierBenefits(client_id);
  }

  @Get('/customer/:customer_id/tier')
  async getCurrentCustomerTier(@Param('customer_id') customerId: number) {
    return await this.service.getCurrentCustomerTier(customerId);
  }

  @Get('business-unit/:business_unit_id')
  async getTiersByBusinessUnit(
    @Param('business_unit_id') business_unit_id: string,
  ) {
    return await this.service.findByBusinessUnit(business_unit_id);
  }
}
