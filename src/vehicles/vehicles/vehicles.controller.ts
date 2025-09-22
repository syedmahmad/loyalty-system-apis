import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly service: VehiclesService) {}

  @Get(':customerId')
  async getCustomerVehicle(
    @Param('customerId') customerId: string,
    @Headers() headers: Record<string, string>,
  ) {
    const tenantId = headers['x-tenant-id'];
    const businessUnitId = headers['x-business-unit-id'];
    return await this.service.getCustomerVehicle({
      customerId,
      tenantId,
      businessUnitId,
    });
  }

  @Post('add')
  async addCustomerVehicle(@Body() bodyPayload: any) {
    return await this.service.addCustomerVehicle(bodyPayload);
  }

  @Get('/service-list/:customerId')
  async getServiceList(
    @Headers() headers: Record<string, string>,
    @Param('customerId') customerId: string,
  ) {
    const tenantId = headers['x-tenant-id'];
    const businessUnitId = headers['x-business-unit-id'];
    return await this.service.getServiceList({
      customerId,
      tenantId,
      businessUnitId,
    });
  }
}
