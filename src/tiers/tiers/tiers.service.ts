import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tier } from '../entities/tier.entity';
import { CreateTierDto } from '../dto/create-tier.dto';
import { UpdateTierDto } from '../dto/update-tier.dto';

@Injectable()
export class TiersService {
  constructor(
    @InjectRepository(Tier)
    private tiersRepository: Repository<Tier>,
  ) {}

  async create(dto: CreateTierDto) {
    const tier = this.tiersRepository.create(dto);
    return await this.tiersRepository.save(tier);
  }

  async findAll() {
    return await this.tiersRepository.find({
      relations: { business_unit: true },
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: number) {
    const tier = await this.tiersRepository.findOne({
      where: { id },
      relations: { business_unit: true },
      order: { created_at: 'DESC' },
    });
    if (!tier) throw new NotFoundException('Tier not found');
    return tier;
  }

  async update(id: number, dto: UpdateTierDto) {
    const tier = await this.findOne(id);
    Object.assign(tier, dto);
    return this.tiersRepository.save(tier);
  }

  async remove(id: number) {
    const tier = await this.findOne(id);
    await this.tiersRepository.remove(tier);
  }
}
