import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  UpdateProfileDto,
  RequestDeletionDto,
} from '../dto/update-profile.dto';
import { Customer } from 'src/customers/entities/customer.entity';
import { OciService } from 'src/oci/oci.service';

@Injectable()
export class CustomerProfileService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    private readonly ociService: OciService,
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

    const decryptedEmail = await this.ociService.decryptData(customer.email);
    customer.email = decryptedEmail;

    const decryptedPhone = await this.ociService.decryptData(customer.phone);
    customer.phone = decryptedPhone;

    return {
      success: true,
      message: 'This is the requested profile information',
      result: customer,
      errors: [],
    };
  }

  async updateProfile(customerId: string, dto: UpdateProfileDto) {
    const customer = await this.customerRepo.findOne({
      where: { uuid: customerId },
    });

    if (!customer) throw new NotFoundException('Customer not found');

    await this.customerRepo.update(customer.id, { id: customer.id, ...dto });

    const profile = await this.getProfile(customerId);

    return {
      success: true,
      message: 'Profile updated successfully',
      result: { ...profile.result },
      errors: [],
    };
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

    return {
      success: true,
      message: 'Account deletion requested',
      result: {},
      errors: [],
    };
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

    return {
      success: true,
      message: 'Account soft deleted successfully',
      result: {},
      errors: [],
    };
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

    return {
      success: true,
      message: 'Account restored successfully',
      result: {},
      errors: [],
    };
  }
}
