import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  Query,
} from '@nestjs/common';
import { CouponTypeService } from './coupon_type.service';
import { CreateCouponTypeDto } from '../dto/create-coupon-type.dto';
import { UpdateCouponTypeDto } from '../dto/update-coupon-type.dto';

@Controller('coupon-types')
export class CouponTypeController {
  constructor(private readonly service: CouponTypeService) {}

  @Post()
  async create(@Body() dto: CreateCouponTypeDto) {
    return await this.service.create(dto);
  }

  @Get()
  async findAll(@Query('id') id?: number) {
    return await this.service.findAll(id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.service.findOne(+id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCouponTypeDto) {
    return await this.service.update(+id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.service.remove(+id);
  }
}
