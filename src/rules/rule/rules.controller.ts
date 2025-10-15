import {
  Controller,
  Headers,
  Post,
  Body,
  Get,
  Param,
  Put,
  Delete,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { RulesService } from './rules.service';
import { CreateRuleDto } from '../dto/create-rule.dto';
import { UpdateRuleDto } from '../dto/update-rule.dto';
import { AuthTokenGuard } from 'src/users/guards/authTokenGuard';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { Repository } from 'typeorm';

@Controller('rules')
export class RulesController {
  constructor(
    private readonly rulesService: RulesService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  @UseGuards(AuthTokenGuard)
  @Post()
  async create(
    @Body() dto: CreateRuleDto,
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

    return this.rulesService.create(dto, user.uuid);
  }

  @Get(':client_id')
  async findAll(
    @Param('client_id') client_id: number,
    @Query('name') name?: string, // optional query param
    @Query('bu') bu?: number, // optional query param
  ) {
    return await this.rulesService.findAll(client_id, name, bu);
  }

  @Get(':tenant_id/third-party')
  async findAllForThirdParty(
    @Param('tenant_id') tenant_id: string,
    @Query('name') name?: string, // optional query param
  ) {
    return await this.rulesService.findAllForThirdParty(tenant_id, name);
  }

  @Get('/single/:uuid')
  findOne(@Param('uuid') uuid: string) {
    return this.rulesService.findOne(uuid);
  }

  @Get('/event-based/:tenant_id/:business_unit_id')
  allEventBased(
    @Param('tenant_id') tenant_id: string,
    @Param('business_unit_id') business_unit_id: string,
    @Query('customer_id') customer_id: string,
    @Query('language_code') language_code: any,
  ) {
    return this.rulesService.allEventBased(
      tenant_id,
      business_unit_id,
      customer_id,
      language_code,
    );
  }

  @Put(':uuid')
  async update(
    @Headers('user-secret') userSecret: string,
    @Param('uuid') uuid: string,
    @Body() dto: UpdateRuleDto,
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

    return this.rulesService.update(uuid, dto, user.uuid);
  }

  @Delete(':uuid')
  async remove(
    @Headers('user-secret') userSecret: string,
    @Param('uuid') uuid: string,
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

    return this.rulesService.remove(uuid, user.uuid);
  }
}
