import { Controller, Get, Post, Body, Param, Patch, Delete } from '@nestjs/common';
import { RewardsService } from './rewards.service';
import { CreateRewardDto } from '../dto/create-reward.dto';
import { UpdateRewardDto } from '../dto/update-reward.dto';

@Controller('rewards')
export class RewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  @Post()
  async create(@Body() createRewardDto: CreateRewardDto) {
    return await this.rewardsService.create(createRewardDto);
  }

  @Get()
  async findAll() {
    return await this.rewardsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.rewardsService.findOne(+id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateRewardDto: UpdateRewardDto) {
    return await this.rewardsService.update(+id, updateRewardDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.rewardsService.remove(+id);
  }
}
