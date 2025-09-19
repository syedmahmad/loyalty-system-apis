import { Controller, Get } from '@nestjs/common';
import { MakeService } from './make.service';

@Controller('makes')
export class MakeController {
  constructor(private readonly makeService: MakeService) {}

  @Get('sync')
  async fetchMakesAndSave() {
    return await this.makeService.fetchMakesAndSave();
  }

  @Get()
  async getAll() {
    return await this.makeService.getAll();
  }
}
