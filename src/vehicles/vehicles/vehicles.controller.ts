import {
  Body,
  Controller,
  // Delete,
  Get,
  Headers,
  Param,
  // Patch,
  Post,
} from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import {
  CreateCarListingDto,
  GogoWebhookDto,
  // MarkVehicleSoldDto,
} from '../dto/create-car-listing.dto';

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

  @Post('upload/images')
  async manageCustomerVehicleImages(
    @Headers() headers: Record<string, string>,
    @Body() body: any,
  ) {
    const tenantId = headers['x-tenant-id'];
    const businessUnitId = headers['x-business-unit-id'];
    return await this.service.manageCustomerVehicleImages(
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
    @Body() body: { reason_for_deletion: string },
  ) {
    const tenantId = headers['x-tenant-id'];
    const businessUnitId = headers['x-business-unit-id'];

    return await this.service.softDeleteVehicle(
      tenantId,
      businessUnitId,
      platNo,
      customerId,
      body?.reason_for_deletion,
    );
  }

  @Post('/service-list')
  async getServiceList(
    @Headers() headers: Record<string, string>,
    @Body() body: { customer_id: string; plateNo: string },
  ) {
    const tenantId = headers['x-tenant-id'];
    const businessUnitId = headers['x-business-unit-id'];

    return await this.service.getServiceList({
      customerId: body.customer_id,
      plateNo: body.plateNo,
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

  @Post('/self-listing')
  async addSelfListingVehicle(@Body() body: CreateCarListingDto) {
    return await this.service.selfCarListing(body);
  }

  // @Patch('mark-sold')
  // async markVehicleSold(@Body() dto: MarkVehicleSoldDto) {
  //   return this.service.markAsSold(dto);
  // }

  // @Delete('delete-self-listing')
  // async deleteVehicleFromGogo(@Body() dto: MarkVehicleSoldDto) {
  //   return this.service.removeVehicleFromGogoMotor(dto);
  // }

  // @Patch('update-self-listing-details')
  // async updateSelfListingDetails(@Body() dto: MarkVehicleSoldDto) {
  //   return this.service.updateVehicleDetailsOnGogoMotor(dto);
  // }

  @Post('/self-listing-webhook')
  async receiveWebhook(@Body() dto: GogoWebhookDto) {
    return this.service.handleGogoWebhook(dto);
  }
}
