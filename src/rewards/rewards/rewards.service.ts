import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reward } from '../entities/reward.entity';
import { CreateRewardDto } from '../dto/create-reward.dto';
import { UpdateRewardDto } from '../dto/update-reward.dto';

@Injectable()
export class RewardsService {
  constructor(
    @InjectRepository(Reward)
    private rewardsRepository: Repository<Reward>,
  ) {}

  async create(createRewardDto: CreateRewardDto): Promise<Reward> {
    const reward = this.rewardsRepository.create(createRewardDto);
    return await this.rewardsRepository.save(reward);
  }

  async findAll(): Promise<Reward[]> {
    return await this.rewardsRepository.find();
  }

  async findOne(id: number): Promise<Reward> {
    const reward = await this.rewardsRepository.findOneBy({ id });
    if (!reward) {
      throw new NotFoundException(`Reward with id ${id} not found`);
    }
    return reward;
  }

  async update(id: number, updateRewardDto: UpdateRewardDto): Promise<Reward> {
    const reward = await this.findOne(id);
    Object.assign(reward, updateRewardDto);
    return await this.rewardsRepository.save(reward);
  }

  async remove(id: number): Promise<void> {
    const reward = await this.findOne(id);
    await this.rewardsRepository.remove(reward);
  }
}
