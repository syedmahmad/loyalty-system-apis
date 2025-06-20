import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
} from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from '../dto/create-tenant.dto';
import { UpdateTenantDto } from '../dto/update-tenant.dto';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly service: TenantsService) {}

  @Post()
  async create(@Body() dto: CreateTenantDto) {
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

  // Optionally, find tenant by domain (e.g. for middleware)
  @Get('/by-domain')
  async findByDomain(@Query('domain') domain: string) {
    return await this.service.findByDomain(domain);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return await this.service.update(+id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.service.remove(+id);
  }
}
