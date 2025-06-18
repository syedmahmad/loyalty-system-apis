import { Controller, Get, Post, Body, Param, Patch, Delete, Put } from '@nestjs/common';
import { TiersService } from './tiers.service';
import { CreateTierDto } from '../dto/create-tier.dto';
import { UpdateTierDto } from '../dto/update-tier.dto';

@Controller('tiers')
export class TiersController {
  constructor(private readonly service: TiersService) {}

  @Post()
  async create(@Body() dto: CreateTierDto) {
    return await this.service.create(dto);
  }

  @Get()
  async findAll() {
    return await this.service.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.service.findOne(+id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTierDto) {
    return await this.service.update(+id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.service.remove(+id);
  }
}
