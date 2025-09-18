import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  UpdateProfileDto,
  RequestDeletionDto,
  ReferByDto,
} from '../dto/update-profile.dto';
import { Customer } from 'src/customers/entities/customer.entity';
import { OciService } from 'src/oci/oci.service';
import { CustomerService } from 'src/customers/customer.service';
import { Log } from 'src/logs/entities/log.entity';
import { Referral } from 'src/wallet/entities/referrals.entity';
import { CouponsService } from 'src/coupons/coupons/coupons.service';
import { Wallet } from 'src/wallet/entities/wallet.entity';

@Injectable()
export class CustomerProfileService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    private readonly ociService: OciService,
    private readonly customerService: CustomerService,
    @InjectRepository(Log)
    private readonly logRepo: Repository<Log>,
    @InjectRepository(Referral)
    private readonly refRepo: Repository<Referral>,
    private readonly couponsService: CouponsService,
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
        'is_new_user',
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

    const customerCoupons = await this.couponsService.getCustomerCoupons({
      custcustomerId: customer.uuid,
      bUId: customer.business_unit.id,
    });

    const userWallet = await this.walletRepo.findOne({
      where: { customer: { id: customerInfo.id } },
    });

    return {
      success: true,
      message: 'This is the requested profile information',
      result: {
        customer: customer,
        total_points: userWallet ? userWallet.total_balance : 0,
        coupons_count: customerCoupons.result.available.length,
      },
      errors: [],
    };
  }

  async updateProfile(customerId: string, dto: UpdateProfileDto) {
    const customer = await this.customerRepo.findOne({
      where: { uuid: customerId },
      relations: ['tenant', 'business_unit'],
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
        'is_new_user',
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

    // Additional Points for Email
    if (profile.email) {
      const earnEmailPhonePoints = {
        customer_id: customer.uuid,
        event: 'Additional Points for Email', // this is important what if someone changes this event name form Frontend
        tenantId: String(customer.tenant.id),
        BUId: String(customer.business_unit.id),
      };
      try {
        const earnedPoints =
          await this.customerService.earnWithEvent(earnEmailPhonePoints);
        // log the external call
        const logs = await this.logRepo.create({
          requestBody: JSON.stringify(earnEmailPhonePoints),
          responseBody: JSON.stringify(earnedPoints),
          url: earnEmailPhonePoints.event,
          method: 'POST',
          statusCode: 200,
        } as Log);
        await this.logRepo.save(logs);
      } catch (err) {
        const logs = await this.logRepo.create({
          requestBody: JSON.stringify(earnEmailPhonePoints),
          responseBody: JSON.stringify(err),
          url: earnEmailPhonePoints.event,
          method: 'POST',
          statusCode: 200,
        } as Log);
        await this.logRepo.save(logs);
      }
    }

    // Additional Points for Gener
    if (profile.gender) {
      const earnGenderPhonePoints = {
        customer_id: customer.uuid,
        event: 'Additional Points for Gender', // this is important what if someone changes this event name form Frontend
        tenantId: String(customer.tenant.id),
        BUId: String(customer.business_unit.id),
      };
      try {
        const earnedPoints = await this.customerService.earnWithEvent(
          earnGenderPhonePoints,
        );
        // log the external call
        const logs = await this.logRepo.create({
          requestBody: JSON.stringify(earnGenderPhonePoints),
          responseBody: JSON.stringify(earnedPoints),
          url: earnGenderPhonePoints.event,
          method: 'POST',
          statusCode: 200,
        } as Log);
        await this.logRepo.save(logs);
      } catch (err) {
        const logs = await this.logRepo.create({
          requestBody: JSON.stringify(earnGenderPhonePoints),
          responseBody: JSON.stringify(err),
          url: earnGenderPhonePoints.event,
          method: 'POST',
          statusCode: 200,
        } as Log);
        await this.logRepo.save(logs);
      }
    }

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

  async UpdateReferralInfo(body: ReferByDto) {
    const businessUnitId = process.env.NCMC_PETROMIN_BU;
    const tenantId = process.env.NCMC_PETROMIN_TENANT;
    const { customer_id, referral_code } = body;

    let referrer_user = null;
    if (referral_code) {
      referrer_user = await this.customerRepo.findOne({
        where: {
          referral_code: referral_code,
          business_unit: { id: Number(businessUnitId) },
          tenant: { id: Number(tenantId) },
        },
        relations: ['business_unit', 'tenant'],
      });
      if (!referrer_user) {
        throw new BadRequestException('referral code does not belongs to us');
      }
    }

    const customer = await this.customerRepo.findOne({
      where: {
        uuid: customer_id,
      },
      relations: ['business_unit', 'tenant'],
    });

    customer.referrer_id = referrer_user.id;
    customer.is_new_user = 0;
    // rewards points to referrer
    const earnReferrerPoints = {
      customer_id: referrer_user.uuid, // need to give points to referrer
      event: 'Referrer Reward Points', // this is important what if someone changes this event name form Frontend
      tenantId: String(referrer_user.tenant.id),
      BUId: String(referrer_user.business_unit.id),
    };
    try {
      const earnedPoints =
        await this.customerService.earnWithEvent(earnReferrerPoints);
      // log the external call
      const logs = await this.logRepo.create({
        requestBody: JSON.stringify(earnReferrerPoints),
        responseBody: JSON.stringify(earnedPoints),
        url: earnReferrerPoints.event,
        method: 'POST',
        statusCode: 200,
      } as Log);
      await this.logRepo.save(logs);
      // insert ion referral table.
      const refRst = await this.refRepo.create({
        referrer_id: referrer_user.id,
        referee_id: customer.id,
        referrer_points: earnedPoints.points,
        referee_points: 0,
        business_unit: { id: customer.business_unit.id },
      } as Referral);
      await this.refRepo.save(refRst);
    } catch (err) {
      const logs = await this.logRepo.create({
        requestBody: JSON.stringify(earnReferrerPoints),
        responseBody: JSON.stringify(err),
        url: earnReferrerPoints.event,
        method: 'POST',
        statusCode: 200,
      } as Log);
      await this.logRepo.save(logs);
    }

    // rewards points to referrer
    const earnRefereePoints = {
      customer_id: customer.uuid, // need to give points to referrer
      event: 'Referee Reward Points', // this is important what if someone changes this event name form Frontend
      tenantId: String(customer.tenant.id),
      BUId: String(customer.business_unit.id),
    };
    try {
      const earnedPoints =
        await this.customerService.earnWithEvent(earnRefereePoints);
      // log the external call
      const logs = await this.logRepo.create({
        requestBody: JSON.stringify(earnRefereePoints),
        responseBody: JSON.stringify(earnedPoints),
        url: earnRefereePoints.event,
        method: 'POST',
        statusCode: 200,
      } as Log);
      await this.logRepo.save(logs);
    } catch (err) {
      const logs = await this.logRepo.create({
        requestBody: JSON.stringify(earnRefereePoints),
        responseBody: JSON.stringify(err),
        url: earnRefereePoints.event,
        method: 'POST',
        statusCode: 200,
      } as Log);
      await this.logRepo.save(logs);
    }

    await this.customerRepo.save(customer);
    return {
      success: true,
      message: 'Success',
      result: {
        customer_id: customer.uuid,
      },
    };
  }
}
