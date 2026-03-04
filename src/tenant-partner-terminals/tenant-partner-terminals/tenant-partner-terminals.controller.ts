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
import { TenantPartnerTerminalsService } from './tenant-partner-terminals.service';
import { CreateTenantPartnerTerminalDto } from '../dto/create-tenant-partner-terminal.dto';
import { UpdateTenantPartnerTerminalDto } from '../dto/update-tenant-partner-terminal.dto';
import { BulkCreateTerminalsDto } from '../dto/bulk-create-terminals.dto';
import { AuthTokenGuard } from 'src/users/guards/authTokenGuard';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { Repository } from 'typeorm';

@Controller('tenant-partner-terminals')
export class TenantPartnerTerminalsController {
  constructor(
    private readonly service: TenantPartnerTerminalsService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  @Get('by-integration/:integrationId')
  async findByIntegration(@Param('integrationId') integrationId: string) {
    return await this.service.findByIntegration(+integrationId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.service.findOne(+id);
  }

  @UseGuards(AuthTokenGuard)
  @Post()
  async create(
    @Body() dto: CreateTenantPartnerTerminalDto,
    @Headers('user-secret') userSecret: string,
  ) {
    if (!userSecret) throw new BadRequestException('user-secret not found in headers');
    const decodedUser: any = jwt.decode(userSecret);
    const user = await this.userRepository.findOne({ where: { id: decodedUser.UserId } });
    if (!user) throw new BadRequestException('user not found against provided token');
    return await this.service.create(dto, user.uuid);
  }

  @UseGuards(AuthTokenGuard)
  @Post('bulk')
  async bulkCreate(
    @Body() dto: BulkCreateTerminalsDto,
    @Headers('user-secret') userSecret: string,
  ) {
    if (!userSecret) throw new BadRequestException('user-secret not found in headers');
    const decodedUser: any = jwt.decode(userSecret);
    const user = await this.userRepository.findOne({ where: { id: decodedUser.UserId } });
    if (!user) throw new BadRequestException('user not found against provided token');
    return await this.service.bulkCreate(dto, user.uuid);
  }

  @UseGuards(AuthTokenGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTenantPartnerTerminalDto,
    @Headers('user-secret') userSecret: string,
  ) {
    if (!userSecret) throw new BadRequestException('user-secret not found in headers');
    const decodedUser: any = jwt.decode(userSecret);
    const user = await this.userRepository.findOne({ where: { id: decodedUser.UserId } });
    if (!user) throw new BadRequestException('user not found against provided token');
    return await this.service.update(+id, dto, user.uuid);
  }

  @UseGuards(AuthTokenGuard)
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Headers('user-secret') userSecret: string,
  ) {
    if (!userSecret) throw new BadRequestException('user-secret not found in headers');
    const decodedUser: any = jwt.decode(userSecret);
    const user = await this.userRepository.findOne({ where: { id: decodedUser.UserId } });
    if (!user) throw new BadRequestException('user not found against provided token');
    return await this.service.remove(+id, user.uuid);
  }
}
