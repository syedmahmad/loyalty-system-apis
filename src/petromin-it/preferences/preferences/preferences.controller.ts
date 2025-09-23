import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { PreferencesService } from './preferences.service';
import { UpdatePreferencesDto } from '../dto/update-preferences.dto';

@Controller('preferences')
export class PreferencesController {
  constructor(private readonly preferencesService: PreferencesService) {}

  // GET /petromin-it/preferences/:customer_uuid
  @Get(':customer_id')
  async getPreferences(@Param('customer_id') customerUuid: string) {
    return await this.preferencesService.getByCustomerUuid(customerUuid);
  }

  // PUT /petromin-it/preferences/:customer_uuid
  @Put(':customer_id')
  async updatePreferences(
    @Param('customer_id') customerUuid: string,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return await this.preferencesService.updateByCustomerUuid(
      customerUuid,
      dto,
    );
  }
}
