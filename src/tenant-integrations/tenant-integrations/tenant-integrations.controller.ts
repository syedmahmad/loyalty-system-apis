import {
  Controller,
  Headers,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { TenantIntegrationsService } from './tenant-integrations.service';
import { CreateTenantIntegrationDto } from '../dto/create-tenant-integration.dto';
import { UpdateTenantIntegrationDto } from '../dto/update-tenant-integration.dto';
import { AuthTokenGuard } from 'src/users/guards/authTokenGuard';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { Repository } from 'typeorm';

@Controller('tenant-integrations')
export class TenantIntegrationsController {
  constructor(
    private readonly service: TenantIntegrationsService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  @Get('by-tenant/:tenantId')
  async findByTenant(@Param('tenantId') tenantId: string) {
    return await this.service.findByTenant(+tenantId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.service.findOne(+id);
  }

  @UseGuards(AuthTokenGuard)
  @Post()
  async create(
    @Body() dto: CreateTenantIntegrationDto,
    @Headers('user-secret') userSecret: string,
  ) {
    if (!userSecret) {
      throw new BadRequestException('user-secret not found in headers');
    }

    const decodedUser: any = jwt.decode(userSecret);

    const user = await this.userRepository.findOne({
      where: { id: decodedUser.UserId },
    });

    if (!user) {
      throw new BadRequestException('user not found against provided token');
    }

    return await this.service.create(dto, user.uuid);
  }

  @UseGuards(AuthTokenGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTenantIntegrationDto,
    @Headers('user-secret') userSecret: string,
  ) {
    if (!userSecret) {
      throw new BadRequestException('user-secret not found in headers');
    }

    const decodedUser: any = jwt.decode(userSecret);

    const user = await this.userRepository.findOne({
      where: { id: decodedUser.UserId },
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
      where: { id: decodedUser.UserId },
    });

    if (!user) {
      throw new BadRequestException('user not found against provided token');
    }

    return await this.service.remove(+id, user.uuid);
  }
}
