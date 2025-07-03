import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { Campaign } from '../entities/campaign.entity';
import { CreateCampaignDto } from '../dto/create-campaign.dto';
import { UpdateCampaignDto } from '../dto/update-campaign.dto';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignService: CampaignsService) {}

  @Post()
  async create(@Body() dto: CreateCampaignDto): Promise<Campaign> {
    return this.campaignService.create(dto);
  }

  @Get(':client_id')
  async findAll(
    @Param('client_id') client_id: number,
    @Query('name') name?: string,
  ): Promise<Campaign[]> {
    return this.campaignService.findAll(client_id, name);
  }

  @Get('/single/:id')
  async findOne(@Param('id') id: number): Promise<Campaign> {
    const campaign = await this.campaignService.findOne(id);
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    return campaign;
  }

  @Put(':id')
  async update(
    @Param('id') id: number,
    @Body() dto: UpdateCampaignDto,
  ): Promise<Campaign> {
    const updated = await this.campaignService.update(id, dto);
    if (!updated) {
      throw new NotFoundException('Campaign not found');
    }
    return updated;
  }
}
