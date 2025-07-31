import {
  Body,
  Headers,
  Controller,
  Get,
  Param,
  Post,
  Put,
  NotFoundException,
  Query,
  UseGuards,
  BadRequestException,
  Delete,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { CampaignsService } from './campaigns.service';
import { Campaign } from '../entities/campaign.entity';
import { CreateCampaignDto } from '../dto/create-campaign.dto';
import { UpdateCampaignDto } from '../dto/update-campaign.dto';
import { AuthTokenGuard } from 'src/users/guards/authTokenGuard';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { Repository } from 'typeorm';

@Controller('campaigns')
export class CampaignsController {
  constructor(
    private readonly campaignService: CampaignsService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  @UseGuards(AuthTokenGuard)
  @Post()
  async create(
    @Body() dto: CreateCampaignDto,
    @Headers('user-secret') userSecret: string,
  ): Promise<Campaign> {
    if (!userSecret) {
      throw new BadRequestException('user-secret not found in headers');
    }

    const decodedUser: any = jwt.decode(userSecret);

    const user = await this.userRepository.findOne({
      where: {
        id: decodedUser.UserId,
      },
    });

    if (!user) {
      throw new BadRequestException('user not found against provided token');
    }

    return this.campaignService.create(dto, user.uuid);
  }

  @Get(':client_id')
  async findAll(
    @Param('client_id') client_id: number,
    @Headers('user-secret') userSecret: string,
    @Query('name') name?: string,
  ): Promise<Campaign[]> {
    if (!userSecret) {
      throw new BadRequestException('user-secret not found in headers');
    }

    const decodedUser: any = jwt.decode(userSecret);

    const user = await this.userRepository.findOne({
      where: {
        id: decodedUser.UserId,
      },
    });

    if (!user) {
      throw new BadRequestException('user not found against provided token');
    }

    return this.campaignService.findAll(client_id, name, user.id);
  }

  @Get('/third-party/:client_id')
  async findAllThirdParty(
    @Param('client_id') client_id: string,
    @Query('name') name?: string,
  ): Promise<Campaign[]> {
    return this.campaignService.findAllForThirdPart(client_id, name);
  }

  @Get('/single/:id')
  async findOne(@Param('id') id: number): Promise<Campaign> {
    const campaign = await this.campaignService.findOne(id);
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    return campaign;
  }

  @Get('third-party/single/:id')
  async findOneForThirdPart(@Param('id') id: string): Promise<Campaign> {
    const campaign = await this.campaignService.findOneThirdParty(id);
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    return campaign;
  }

  @UseGuards(AuthTokenGuard)
  @Put(':id')
  async update(
    @Param('id') id: number,
    @Body() dto: UpdateCampaignDto,
    @Headers('user-secret') userSecret: string,
  ): Promise<Campaign> {
    if (!userSecret) {
      throw new BadRequestException('user-secret not found in headers');
    }

    const decodedUser: any = jwt.decode(userSecret);

    const user = await this.userRepository.findOne({
      where: {
        id: decodedUser.UserId,
      },
    });

    if (!user) {
      throw new BadRequestException('user not found against provided token');
    }

    const updated = await this.campaignService.update(id, dto, user.uuid);
    if (!updated) {
      throw new NotFoundException('Campaign not found');
    }
    return updated;
  }

  @UseGuards(AuthTokenGuard)
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Headers('user-secret') userSecret: string,
  ) {
    if (!userSecret) {
      throw new BadRequestException('user-secret not found in headers');
    }

    const decodedUser: any = jwt.decode(userSecret);

    const user = await this.userRepository.findOne({
      where: {
        id: decodedUser.UserId,
      },
    });

    if (!user) {
      throw new BadRequestException('user not found against provided token');
    }

    return await this.campaignService.remove(+id, user.uuid);
  }
}
