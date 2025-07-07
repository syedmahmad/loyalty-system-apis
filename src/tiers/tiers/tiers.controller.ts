import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  Query,
} from '@nestjs/common';
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

  @Get(':client_id')
  async findAll(
    @Param('client_id') client_id: number,
    @Query('name') name?: string, // optional query param
  ) {
    return await this.service.findAll(client_id, name);
  }

  @Get('/single/:id')
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
