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
import { CouponsService } from './coupons.service';
import { CreateCouponDto } from '../dto/create-coupon.dto';
import { UpdateCouponDto } from '../dto/update-coupon.dto';

@Controller('coupons')
export class CouponsController {
  constructor(private readonly service: CouponsService) {}

  @Post()
  async create(@Body() dto: CreateCouponDto) {
    return await this.service.create(dto);
  }

  @Get('/:client_id')
  async findAll(
    @Param('client_id') client_id: number,
    @Query('name') name?: string, // optional query param
  ) {
    return await this.service.findAll(client_id, name);
  }

  @Get('edit/:id')
  async findOne(@Param('id') id: string) {
    return await this.service.findOne(+id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return await this.service.update(+id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.service.remove(+id);
  }

  @Get('vehicle/makes')
  async findMakes() {
    // return await this.service.findMakes();
  }
}
