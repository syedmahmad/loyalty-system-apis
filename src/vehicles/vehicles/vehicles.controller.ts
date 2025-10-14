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

  @Post('manage')
  async manageCustomerVehicle(
    @Headers() headers: Record<string, string>,
    @Body() body: any,
  ) {
    const tenantId = headers['x-tenant-id'];
    const businessUnitId = headers['x-business-unit-id'];
    return await this.service.manageCustomerVehicle(
      tenantId,
      businessUnitId,
      body,
    );
  }

  @Post(':platNo/:customerId')
  async deleteCustomerVehicle(
    @Headers() headers: Record<string, string>,
    @Param('platNo') platNo: string,
    @Param('customerId') customerId: string,
  ) {
    const tenantId = headers['x-tenant-id'];
    const businessUnitId = headers['x-business-unit-id'];

    return await this.service.softDeleteVehicle(
      tenantId,
      businessUnitId,
      platNo,
      customerId,
    );
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

  @Get('/get-last-service-feedback/:customerId')
  async getLastServiceFeedback(
    @Headers() headers: Record<string, string>,
    @Param('customerId') customerId: string,
  ) {
    const tenantId = headers['x-tenant-id'];
    const businessUnitId = headers['x-business-unit-id'];

    return await this.service.getLastServiceFeedback({
      customerId,
      tenantId,
      businessUnitId,
    });
  }
}
