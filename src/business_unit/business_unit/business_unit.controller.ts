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
import { BusinessUnitsService } from './business_unit.service';
import { CreateBusinessUnitDto } from '../dto/create-business-unit.dto';
import { UpdateBusinessUnitDto } from '../dto/update-business-unit.dto';

@Controller('business-units')
export class BusinessUnitsController {
  constructor(private readonly service: BusinessUnitsService) {}

  @Post()
  async create(@Body() dto: CreateBusinessUnitDto) {
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
  async update(@Param('id') id: string, @Body() dto: UpdateBusinessUnitDto) {
    return await this.service.update(+id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.service.remove(+id);
  }
}
