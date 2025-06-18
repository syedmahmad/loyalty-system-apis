import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Point } from '../entities/point.entity';
import { CreatePointDto } from '../dto/create-point.dto';
import { UpdatePointDto } from '../dto/update-point.dto';

@Injectable()
export class PointsService {
  constructor(
    @InjectRepository(Point)
    private pointsRepository: Repository<Point>,
  ) {}

  async create(dto: CreatePointDto) {
    const point = this.pointsRepository.create(dto);
    return await this.pointsRepository.save(point);
  }

  async findAll() {
    return await this.pointsRepository.find();
  }

  async findOne(id: number) {
    const point = await this.pointsRepository.findOneBy({ id });
    if (!point) throw new NotFoundException('Point not found');
    return point;
  }

  async update(id: number, dto: UpdatePointDto) {
    const point = await this.findOne(id);
    Object.assign(point, dto);
    return this.pointsRepository.save(point);
  }

  async remove(id: number) {
    const point = await this.findOne(id);
    await this.pointsRepository.remove(point);
  }

  /*async findPointsForTenant(tenantId: number) {
    return this.pointsRepository.find({ where: { tenantId } });
  }*/

  async findAllByTenant(tenantId: number) {
    //return await this.pointsRepository.find({ where: { tenantId } });
  }
}
