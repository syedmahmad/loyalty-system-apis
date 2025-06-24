import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign } from '../entities/campaign.entity';
import { CreateCampaignDto } from '../dto/create-campaign.dto';
import { UpdateCampaignDto } from '../dto/update-campaign.dto';
import { RuleTarget } from '../../rules/entities/rule-target.entity'; // adjust path

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private campaignsRepository: Repository<Campaign>,
    @InjectRepository(RuleTarget)
    private ruleTargetRepository: Repository<RuleTarget>,
  ) {}

  async create(createCampaignDto: CreateCampaignDto): Promise<Campaign> {
    const createdBy = createCampaignDto.created_by || 2;
    const campaign = this.campaignsRepository.create(createCampaignDto);
    const savedCampaign = await this.campaignsRepository.save(campaign);

    // 2. Save rule_targets
    if (createCampaignDto.rule_targets?.length) {
      const targets = createCampaignDto.rule_targets.map((rt) =>
        this.ruleTargetRepository.create({
          rule_id: rt.rule_id,
          target_type: 'campaign',
          target_id: savedCampaign.id,
          created_by: createdBy,
          updated_by: createdBy,
        }),
      );
      await this.ruleTargetRepository.save(targets);
    }

    return savedCampaign;
  }

  async findAll(): Promise<Campaign[]> {
    return await this.campaignsRepository.find({
      relations: ['business_unit'],
    });
  }

  async findOne(id: number) {
    const campaign = await this.campaignsRepository.findOneBy({ id });
    if (!campaign) {
      throw new NotFoundException(`Campaign with id ${id} not found`);
    }

    const ruleTargets = await this.ruleTargetRepository.find({
      where: {
        target_type: 'campaign',
        target_id: id,
      },
      relations: { rule: true },
    });

    const rule_targets = ruleTargets.map((rt) => ({
      id: rt.id,
      rule_id: rt.rule_id,
    }));

    return {
      ...campaign,
      rule_targets,
    };
  }

  async update(
    id: number,
    updateCampaignDto: UpdateCampaignDto,
  ): Promise<Campaign> {
    const campaign = await this.findOne(id);
    Object.assign(campaign, updateCampaignDto);
    const saved = await this.campaignsRepository.save(campaign);

    const updatedBy = updateCampaignDto.updated_by || 2;

    // Delete existing rule_targets
    await this.ruleTargetRepository.delete({
      target_type: 'campaign',
      target_id: id,
    });

    // Add new rule_targets
    if (updateCampaignDto.rule_targets?.length) {
      const newTargets = updateCampaignDto.rule_targets.map((rt) =>
        this.ruleTargetRepository.create({
          rule_id: rt.rule_id,
          target_type: 'campaign',
          target_id: id,
          created_by: updatedBy,
          updated_by: updatedBy,
        }),
      );
      await this.ruleTargetRepository.save(newTargets);
    }

    return saved;
  }

  async remove(id: number): Promise<void> {
    const campaign = await this.findOne(id);
    await this.campaignsRepository.remove(campaign);
  }
}
