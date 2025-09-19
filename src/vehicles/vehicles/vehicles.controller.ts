import { Controller, Get, Headers, Param } from '@nestjs/common';
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
}
