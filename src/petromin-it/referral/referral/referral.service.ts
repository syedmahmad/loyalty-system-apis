import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Customer } from 'src/customers/entities/customer.entity';
import { Referral } from 'src/wallet/entities/referrals.entity';

@Injectable()
export class ReferralService {
  constructor(
    @InjectRepository(Referral)
    private referralRepo: Repository<Referral>,

    @InjectRepository(Customer)
    private customerRepo: Repository<Customer>,
  ) {}

  async getReferralHistory(customerId: string) {
    // find the customer
    const customer = await this.customerRepo.findOne({
      where: { uuid: customerId },
      select: ['id', 'name', 'email', 'phone', 'referral_code'],
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    if (customer.status === 0) {
      throw new Error('Customer is inactive');
    }

    if (customer.status === 3) {
      throw new Error('Customer is deleted');
    }

    // load referral history (people who joined via this customer)
    const referrals = await this.referralRepo.find({
      where: { referrer_id: customer.id },
      relations: ['business_unit'], // add more relations if needed
      order: { created_at: 'DESC' },
    });

    // map referee details
    const refereeIds = referrals.map((r) => r.referee_id);

    const referees =
      refereeIds.length > 0
        ? await this.customerRepo.find({
            where: { id: In(refereeIds) },
            select: ['id', 'name', 'email', 'phone', 'external_customer_id'],
          })
        : [];

    // build response
    return {
      success: true,
      message: 'Referral history retrieved successfully',
      result: {
        referral_code: customer.referral_code,
        history: referrals.map((ref) => ({
          referee_name:
            referees.find((c) => c.id === ref.referee_id)?.name || null,
          referrer_points: ref.referrer_points,
          referee_points: ref.referee_points,
          created_at: ref.created_at,
        })),
      },
      errors: [],
    };
  }
}
