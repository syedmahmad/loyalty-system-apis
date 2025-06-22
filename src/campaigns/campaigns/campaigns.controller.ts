import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
} from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from '../dto/create-campaign.dto';
import { UpdateCampaignDto } from '../dto/update-campaign.dto';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post()
  async create(@Body() createCampaignDto: CreateCampaignDto) {
    return await this.campaignsService.create(createCampaignDto);
  }

  @Get()
  async findAll() {
    return await this.campaignsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.campaignsService.findOne(+id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateCampaignDto: UpdateCampaignDto,
  ) {
    return await this.campaignsService.update(+id, updateCampaignDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.campaignsService.remove(+id);
  }
}
