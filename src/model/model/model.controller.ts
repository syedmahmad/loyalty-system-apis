import { Controller, Get, Query } from '@nestjs/common';
import { ModelService } from './model.service';
import { GetModelsDto, GetYearsDto } from '../dto/model.dto';

@Controller('models')
export class ModelController {
  constructor(private readonly modelService: ModelService) {}

  @Get('sync')
  async fetchModelAndSave() {
    return await this.modelService.fetchModelAndSave();
  }

  @Get()
  async getAll(@Query() data: GetModelsDto) {
    return await this.modelService.getAll(data);
  }

  @Get('years')
  async getAllYears(@Query() data: GetYearsDto) {
    return await this.modelService.getAllYears(data);
  }
}
