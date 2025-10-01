import {
  Controller,
  Get,
  Param,
  Put,
  Body,
  Post,
  Patch,
  Query,
} from '@nestjs/common';
import {
  UpdateProfileDto,
  RequestDeletionDto,
  ReferByDto,
} from '../dto/update-profile.dto';
import { CustomerProfileService } from './profile.service';

@Controller('customers/:id/profile')
export class CustomerProfileController {
  constructor(private readonly profileService: CustomerProfileService) {}

  @Get()
  async getProfile(
    @Param('id') id: string,
    @Query('language_code') languague_code: string,
  ) {
    return await this.profileService.getProfile(id, languague_code);
  }

  @Put()
  async updateProfile(@Param('id') id: string, @Body() dto: UpdateProfileDto) {
    return await this.profileService.updateProfile(id, dto);
  }

  @Post('delete-request')
  async requestDeletion(
    @Param('id') id: string,
    @Body() dto: RequestDeletionDto,
  ) {
    return await this.profileService.requestAccountDeletion(id, dto);
  }

  @Post('refer-by')
  async referBy(@Body() dto: ReferByDto) {
    return await this.profileService.UpdateReferralInfo(dto);
  }

  @Post()
  async confirmDeletion(
    @Param('id') id: string,
    @Body() dto: RequestDeletionDto,
  ) {
    return await this.profileService.confirmAccountDeletion(id, dto);
  }

  @Patch('restore')
  async restoreAccount(@Param('id') id: string) {
    return await this.profileService.restoreAccount(id);
  }
}
