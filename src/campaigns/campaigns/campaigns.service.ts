import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign } from '../entities/campaign.entity';
import { CreateCampaignDto } from '../dto/create-campaign.dto';
import { UpdateCampaignDto } from '../dto/update-campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private campaignsRepository: Repository<Campaign>,
  ) {}

  async create(createCampaignDto: CreateCampaignDto): Promise<Campaign> {
    const campaign = this.campaignsRepository.create(createCampaignDto);
    return await this.campaignsRepository.save(campaign);
  }

  async findAll(): Promise<Campaign[]> {
    return await this.campaignsRepository.find();
  }

  async findOne(id: number): Promise<Campaign> {
    const campaign = await this.campaignsRepository.findOneBy({ id });
    if (!campaign) {
      throw new NotFoundException(`Campaign with id ${id} not found`);
    }
    return campaign;
  }

  async update(
    id: number,
    updateCampaignDto: UpdateCampaignDto,
  ): Promise<Campaign> {
    const campaign = await this.findOne(id);
    Object.assign(campaign, updateCampaignDto);
    return await this.campaignsRepository.save(campaign);
  }

  async remove(id: number): Promise<void> {
    const campaign = await this.findOne(id);
    await this.campaignsRepository.remove(campaign);
  }
}
