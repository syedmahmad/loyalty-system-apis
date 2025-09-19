import { Controller, Get, Query } from '@nestjs/common';
import { VariantService } from './variant.service';
import { GetVariantsDto } from '../dto/variant.dto';

/**
 * Controller responsible for vehicle variant/trim endpoints
 * Provides API routes for retrieving and synchronizing variant data
 */
@Controller('variants')
export class VariantController {
  constructor(private readonly variantService: VariantService) {}

  /**
   * Synchronizes vehicle variants/trims with the external data source
   * @returns Confirmation of successful synchronization
   */
  @Get('sync')
  async fetchVariantAndSave() {
    return await this.variantService.fetchVariantAndSave();
  }

  /**
   * Retrieves vehicle variants/trims for a specific model
   * @param data - Query parameters containing model ID to filter variants
   * @returns List of variants for the specified model
   */
  @Get()
  async getAll(@Query() data: GetVariantsDto) {
    return await this.variantService.getAll(data);
  }
}
