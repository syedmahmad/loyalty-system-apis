import { Controller, Get, Post, Body, Param, Patch, Delete, Headers, BadRequestException } from '@nestjs/common';
import { PointsService } from './points.service';
import { CreatePointDto } from '../dto/create-point.dto';
import { UpdatePointDto } from '../dto/update-point.dto';
import { Tenant } from 'src/common/decorators/tenant.decorator';
import { Tenant  as TenantEntity } from 'src/tenants/entities/tenant.entity';

@Controller('points')
export class PointsController {
  constructor(private readonly pointsService: PointsService) {}

  @Post()
  async create(@Body() dto: CreatePointDto) {
    return await this.pointsService.create(dto);
  }

  @Get('allpoints')
  async findAll() {
    return await this.pointsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.pointsService.findOne(+id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePointDto) {
    return await this.pointsService.update(+id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.pointsService.remove(+id);
  }

  /*@Get('tenant-point')
  getTenantPoints(@Tenant() tenant: TenantEntity) {
    console.log(tenant.id);return;
    //return this.pointsService.findPointsForTenant(tenant.id);
  }*/

  //Option 1: Param-based
  @Get('tenant/:tenantId')
  async findByTenant(@Param('tenantId') tenantId: string) {
    return await this.pointsService.findAllByTenant(+tenantId);
  }

  //Option 2: Header-based
  @Get('tenantpoints')
  async findPointByTenant(@Headers('x-tenant-id') tenantId: string) {
    const id = Number(tenantId);
  if (isNaN(id)) {
    throw new BadRequestException('Invalid tenant ID');
  }
  return this.pointsService.findAllByTenant(id);
  }
}
