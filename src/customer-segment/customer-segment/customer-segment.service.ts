import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CustomerSegment } from '../entities/customer-segment.entity';
import { CreateCustomerSegmentDto } from '../dto/create.dto';
import { UpdateCustomerSegmentDto } from '../dto/update-customer-segment.dto';
import { Customer } from 'src/customers/entities/customer.entity';
import { CustomerSegmentMember } from '../entities/customer-segment-member.entity';

@Injectable()
export class CustomerSegmentsService {
  constructor(
    @InjectRepository(CustomerSegment)
    private readonly segmentRepository: Repository<CustomerSegment>,

    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,

    @InjectRepository(CustomerSegmentMember)
    private readonly memberRepository: Repository<CustomerSegmentMember>,

    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateCustomerSegmentDto, user: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      queryRunner.data = { user };

      const repo = queryRunner.manager.getRepository(CustomerSegment);
      const segment = repo.create({
        ...dto,
        status: 1,
      });

      const saved = await repo.save(segment);

      await queryRunner.commitTransaction();
      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(client_id: number) {
    return await this.segmentRepository.find({
      where: {
        tenant_id: client_id,
        status: 1,
      },
      relations: ['members', 'members.customer'],
    });
  }

  async findOne(id: number) {
    return await this.segmentRepository.findOne({
      where: { id },
      relations: ['members', 'members.customer'],
    });
  }

  async getCustomers(segmentId: number) {
    const segment = await this.segmentRepository.findOne({
      where: { id: segmentId },
      relations: ['members', 'members.customer'],
    });
    console.log(`Segment ID: ${segmentId}`, segment);

    if (!segment) {
      throw new NotFoundException(`Segment with ID ${segmentId} not found`);
    }

    return segment;
  }

  async addCustomerToSegment(segmentId: number, customerId: number) {
    const segment = await this.segmentRepository.findOne({
      where: { id: segmentId },
    });
    if (!segment) throw new NotFoundException('Customer segment not found');

    const customer = await this.customerRepository.findOne({
      where: { id: customerId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const existing = await this.memberRepository.findOne({
      where: { segment_id: segmentId, customer_id: customerId },
    });
    if (existing) return { message: 'Customer already in segment' };

    const member = this.memberRepository.create({
      segment_id: segmentId,
      customer_id: customerId,
    });
    await this.memberRepository.save(member);

    return { message: 'Customer added successfully' };
  }

  async removeCustomerFromSegment(segmentId: number, customerId: number) {
    const segment = await this.segmentRepository.findOne({
      where: { id: segmentId },
    });
    if (!segment) throw new NotFoundException('Customer segment not found');

    const customer = await this.customerRepository.findOne({
      where: { id: customerId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const existing = await this.memberRepository.findOne({
      where: { segment_id: segmentId, customer_id: customerId },
    });
    if (!existing) {
      return { message: 'Customer not in segment' };
    }

    await this.memberRepository.remove(existing);

    return { message: 'Customer removed successfully' };
  }

  async update(id: number, dto: UpdateCustomerSegmentDto, user: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      queryRunner.data = { user };

      const repo = queryRunner.manager.getRepository(CustomerSegment);

      const segment = await repo.findOne({ where: { id } });
      if (!segment)
        throw new NotFoundException(`Segment with ID ${id} not found`);

      repo.merge(segment, dto);
      const updated = await repo.save(segment);

      await queryRunner.commitTransaction();
      return updated;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(id: number, user: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      queryRunner.data = { user };

      const repo = queryRunner.manager.getRepository(CustomerSegment);

      const segment = await repo.findOne({ where: { id } });
      if (!segment)
        throw new NotFoundException(`Segment with ID ${id} not found`);

      segment.status = 0;
      await repo.save(segment);

      await queryRunner.commitTransaction();
      return { message: 'Segment marked as inactive' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
