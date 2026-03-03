import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Partner } from '../entities/partner.entity';
import { User } from 'src/users/entities/user.entity';
import { CreatePartnerDto } from '../dto/create-partner.dto';
import { UpdatePartnerDto } from '../dto/update-partner.dto';

@Injectable()
export class PartnersService {
  constructor(
    @InjectRepository(Partner)
    private partnerRepository: Repository<Partner>,

    @InjectRepository(User)
    private userRepository: Repository<User>,

    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<Partner[]> {
    return this.partnerRepository.find({ order: { created_at: 'DESC' } });
  }

  async findOne(id: number): Promise<Partner> {
    const partner = await this.partnerRepository.findOne({ where: { id } });
    if (!partner) {
      throw new NotFoundException(`Partner #${id} not found`);
    }
    return partner;
  }

  async create(dto: CreatePartnerDto, userUuid: string): Promise<Partner> {
    const user = await this.userRepository.findOne({
      where: { uuid: userUuid },
    });
    if (!user) {
      throw new BadRequestException('User not found against user-token');
    }

    const existing = await this.partnerRepository.findOne({
      where: { name: dto.name },
    });
    if (existing) {
      throw new BadRequestException(
        `A partner with name "${dto.name}" already exists`,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const partner = queryRunner.manager.create(Partner, {
        name: dto.name,
        type: dto.type,
        description: dto.description,
        logo_url: dto.logo_url,
        is_active: 1,
        created_by: user.id,
        updated_by: user.id,
      });

      const saved = await queryRunner.manager.save(partner);
      await queryRunner.commitTransaction();
      return saved;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async update(
    id: number,
    dto: UpdatePartnerDto,
    userUuid: string,
  ): Promise<Partner> {
    const user = await this.userRepository.findOne({
      where: { uuid: userUuid },
    });
    if (!user) {
      throw new BadRequestException('User not found against user-token');
    }

    const partner = await this.partnerRepository.findOne({ where: { id } });
    if (!partner) {
      throw new NotFoundException(`Partner #${id} not found`);
    }

    if (dto.name && dto.name !== partner.name) {
      const existing = await this.partnerRepository.findOne({
        where: { name: dto.name },
      });
      if (existing) {
        throw new BadRequestException(
          `A partner with name "${dto.name}" already exists`,
        );
      }
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.update(
        Partner,
        { id },
        {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.type !== undefined && { type: dto.type }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.logo_url !== undefined && { logo_url: dto.logo_url }),
          ...(dto.is_active !== undefined && { is_active: dto.is_active }),
          updated_by: user.id,
        },
      );

      await queryRunner.commitTransaction();
      return this.partnerRepository.findOne({ where: { id } });
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(id: number, userUuid: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { uuid: userUuid },
    });
    if (!user) {
      throw new BadRequestException('User not found against user-token');
    }

    const partner = await this.partnerRepository.findOne({ where: { id } });
    if (!partner) {
      throw new NotFoundException(`Partner #${id} not found`);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Soft delete: set is_active = 0
      await queryRunner.manager.update(
        Partner,
        { id },
        {
          is_active: 0,
          updated_by: user.id,
        },
      );

      await queryRunner.commitTransaction();
      return { message: 'Partner removed successfully' };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
