import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  UpdateProfileDto,
  RequestDeletionDto,
} from '../dto/update-profile.dto';
import { Customer } from 'src/customers/entities/customer.entity';

@Injectable()
export class CustomerProfileService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
  ) {}

  async getProfile(customerId: string) {
    const customerInfo = await this.customerRepo.findOne({
      where: { uuid: customerId },
    });

    if (!customerInfo) throw new NotFoundException('Customer not found');

    const customer = await this.customerRepo.findOne({
      where: { id: customerInfo.id },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async updateProfile(customerId: string, dto: UpdateProfileDto) {
    const customer = await this.customerRepo.findOne({
      where: { uuid: customerId },
    });

    if (!customer) throw new NotFoundException('Customer not found');

    await this.customerRepo.update(customer.id, { id: customer.id, ...dto });
    return this.getProfile(customerId);
  }

  async requestAccountDeletion(customerId: string, dto: RequestDeletionDto) {
    const customer = await this.customerRepo.findOne({
      where: { uuid: customerId },
    });

    if (!customer) throw new NotFoundException('Customer not found');

    await this.customerRepo.update(customer.id, {
      id: customer.id,
      is_delete_requested: 1,
      delete_requested_at: new Date(),
      reason_for_deletion: dto.reason_for_deletion,
      reason_for_deletion_other: dto.reason_for_deletion_other,
    });

    return { message: 'Account deletion requested' };
  }

  /**
   * Soft delete = deactivate account but keep record
   */
  async confirmAccountDeletion(customerId: string) {
    const customerInfo = await this.customerRepo.findOne({
      where: { uuid: customerId },
    });

    if (!customerInfo) throw new NotFoundException('Customer not found');

    const customer = await this.customerRepo.findOne({
      where: { id: customerInfo.id },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    await this.customerRepo.update(customerInfo.id, {
      id: customerInfo.id,
      deletion_status: 1, // marked as deleted
      is_delete_requested: 0, // clear request flag
      status: 0, // inactive
      deleted_by: customerInfo.id,
      deleted_at: new Date(),
    });

    return { message: 'Account soft deleted successfully' };
  }

  /**
   * Restore a previously soft-deleted account
   */
  async restoreAccount(customerId: string) {
    const customerInfo = await this.customerRepo.findOne({
      where: { uuid: customerId },
    });

    if (!customerInfo) throw new NotFoundException('Customer not found');

    const customer = await this.customerRepo.findOne({
      where: { id: customerInfo.id },
    });

    if (!customer) throw new NotFoundException('Customer not found');

    await this.customerRepo.update(customerInfo.id, {
      id: customerInfo.id,
      deletion_status: 0,
      status: 1,
      deleted_at: null,
      deleted_by: null,
    });

    return { message: 'Account restored successfully' };
  }
}
