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
import { PartnersService } from './partners.service';
import { CreatePartnerDto } from '../dto/create-partner.dto';
import { UpdatePartnerDto } from '../dto/update-partner.dto';
import { AuthTokenGuard } from 'src/users/guards/authTokenGuard';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { Repository } from 'typeorm';

@Controller('partners')
export class PartnersController {
  constructor(
    private readonly service: PartnersService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  @Get()
  async findAll() {
    return await this.service.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.service.findOne(+id);
  }

  @UseGuards(AuthTokenGuard)
  @Post()
  async create(
    @Body() dto: CreatePartnerDto,
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
    @Body() dto: UpdatePartnerDto,
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
