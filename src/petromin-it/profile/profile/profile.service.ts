import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  UpdateProfileDto,
  RequestDeletionDto,
} from '../dto/update-profile.dto';
import { Customer } from 'src/customers/entities/customer.entity';
import { OciService } from 'src/oci/oci.service';
// import { CustomerService } from 'src/customers/customer.service';

@Injectable()
export class CustomerProfileService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    private readonly ociService: OciService,
    // private readonly customerService: CustomerService,
  ) {}

  async getProfile(customerId: string) {
    const customerInfo = await this.customerRepo.findOne({
      where: { uuid: customerId },
    });

    if (!customerInfo) throw new NotFoundException('Customer not found');

    if (customerInfo.status === 0) {
      throw new NotFoundException('Customer is Inactive');
    }

    if (customerInfo.status === 3) {
      throw new NotFoundException('Customer is deleted');
    }

    const customer = await this.customerRepo.findOne({
      where: { id: customerInfo.id },
      select: [
        'uuid',
        'first_name',
        'last_name',
        // 'name',
        'email',
        'phone',
        // 'country_code',
        'gender',
        'DOB',
        'image_url',
        // 'nationality',
        'address',
        'city',
        // 'custom_city',
        'country',
        // 'notify_tier',
      ],
    });

    if (!customer) throw new NotFoundException('Customer not found');

    if (!customer.external_customer_id) {
      const decryptedEmail = await this.ociService.decryptData(customer.email);
      customer.email = decryptedEmail;

      const decryptedPhone = await this.ociService.decryptData(customer.phone);
      customer.phone = decryptedPhone;
    }
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

    if (customer.status === 0) {
      throw new NotFoundException('Customer is Inactive');
    }

    if (customer.status === 3) {
      throw new NotFoundException('Customer is deleted');
    }

    let encryptedPhone: string | undefined;
    let encryptedEmail: string | undefined;

    if (!customer.external_customer_id) {
      try {
        if (dto.phone) {
          encryptedPhone = (await this.ociService.encryptData(
            dto.phone,
          )) as string;
        }

        if (dto.email) {
          encryptedEmail = (await this.ociService.encryptData(
            dto.email,
          )) as string;
        }
      } catch (err) {
        throw new Error(`Encryption failed: ${err.message}`);
      }
    }

    await this.customerRepo.update(customer.id, {
      ...dto,
      id: customer.id,
      email: encryptedEmail,
      phone: encryptedPhone,
    });

    const profile = await this.customerRepo.findOne({
      where: { id: customer.id },
      select: [
        'uuid',
        'first_name',
        'last_name',
        // 'name',
        'email',
        'phone',
        // 'country_code',
        'gender',
        'DOB',
        'image_url',
        // 'nationality',
        'address',
        'city',
        // 'custom_city',
        'country',
        // 'notify_tier',
      ],
    });

    // Additional Points for Phone
    // if (profile.email) {
    //   const earnAddPhonePoints = {
    //     customer_id: customer.uuid,
    //     event: 'Additional Points for Email', // this is important what if someone changes this event name form Frontend
    //     tenantId: String(customer.tenant.id),
    //     BUId: String(customer.business_unit.id),
    //   };
    //   try {
    //     const earnedPoints =
    //       await this.customerService.earnWithEvent(earnAddPhonePoints);
    //     // log the external call
    //     const logs = await this.logRepo.create({
    //       requestBody: JSON.stringify(earnAddPhonePoints),
    //       responseBody: JSON.stringify(earnedPoints),
    //       url: earnAddPhonePoints.event,
    //       method: 'POST',
    //       statusCode: 200,
    //     } as Log);
    //     await this.logRepo.save(logs);
    //   } catch (err) {
    //     const logs = await this.logRepo.create({
    //       requestBody: JSON.stringify(earnAddPhonePoints),
    //       responseBody: JSON.stringify(err),
    //       url: earnAddPhonePoints.event,
    //       method: 'POST',
    //       statusCode: 200,
    //     } as Log);
    //     await this.logRepo.save(logs);
    //   }
    // }

    let decryptedEmail;
    let decryptedPhone;

    if (!customer.external_customer_id) {
      try {
        if (profile.phone) {
          decryptedPhone = (await this.ociService.decryptData(
            profile.phone,
          )) as string;
        }

        if (profile.email) {
          decryptedEmail = (await this.ociService.decryptData(
            profile.email,
          )) as string;
        }
      } catch (err) {
        throw new Error(`Encryption failed: ${err.message}`);
      }
    }

    return {
      success: true,
      message: 'Profile updated successfully',
      result: { ...profile, email: decryptedEmail, phone: decryptedPhone },
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
  async confirmAccountDeletion(customerId: string, dto: RequestDeletionDto) {
    const customerInfo = await this.customerRepo.findOne({
      where: { uuid: customerId },
    });

    if (!customerInfo) throw new NotFoundException('Customer not found');

    await this.customerRepo.update(customerInfo.id, {
      id: customerInfo.id,
      deletion_status: 1, // marked as deleted, it should be 1 as per existing system
      is_delete_requested: 1, // clear request flag, it should be 1 as per existing system
      status: 3, // inactive should be set to 3 according to exsiitng spareit.
      deleted_by: customerInfo.id,
      deleted_at: new Date(), //this shoudl eb set
      delete_requested_at: new Date(),
      reason_for_deletion: dto.reason_for_deletion,
      reason_for_deletion_other: dto.reason_for_deletion_other,
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
