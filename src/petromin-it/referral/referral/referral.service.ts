import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Customer } from 'src/customers/entities/customer.entity';
import { Referral } from 'src/wallet/entities/referrals.entity';
import { decrypt } from 'src/helpers/encryption';

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
    if (!customerId) throw new NotFoundException(`Customer not found`);

    // Optimized: combine queries, reduce lookups, and use a map for referees
    const customer = await this.customerRepo.findOne({
      where: { uuid: customerId, status: 1 },
      select: ['id', 'name', 'email', 'phone', 'referral_code', 'status'],
    });

    if (!customer) throw new NotFoundException(`Customer not found`);

    // Get all referrals and referees in one go
    // referee_id: customer who referred another customer
    // if external_system_id is present then we need to fetch referral history via external_system_id instead of id as
    // after migration adn during migration, we did not maintain history of this thing.
    let idToFetchHistory: any = customer.id;
    if (customer?.external_customer_id) {
      idToFetchHistory = customer.external_customer_id;
      console.log(
        '///////////////idToFetchHistory/////////',
        idToFetchHistory,
        customer.id,
      );
    }
    console.log(
      '///////////////idToFetchHistory/////////',
      idToFetchHistory,
      customer.id,
    );
    const referrals = await this.referralRepo.find({
      where: { referrer_id: idToFetchHistory },
      relations: ['business_unit'],
      order: { created_at: 'DESC' },
    });

    console.log('///////////////referrals/////////', referrals);
    if (!referrals.length) {
      return {
        success: true,
        message: 'Referral history retrieved successfully',
        result: {
          referral_code: customer.referral_code,
          history: [],
        },
        errors: [],
      };
    }
    console.log('///////////////referrals After/////////');
    const refereeIds = Array.from(new Set(referrals.map((r) => r.referee_id)));
    const referees = await this.customerRepo.find({
      where: { id: In(refereeIds) },
      select: ['id', 'name', 'hashed_number'],
    });

    // Build a map for quick lookup
    const refereeMap = new Map(referees.map((r) => [r.id, r]));

    return {
      success: true,
      message: 'Referral history retrieved successfully',
      result: {
        referral_code: customer.referral_code,
        history: referrals.map((ref) => ({
          referee_name: refereeMap.get(ref.referee_id)?.name || null,
          referee_phone:
            decrypt(refereeMap.get(ref.referee_id)?.hashed_number) || null,
          referrer_points: ref.referrer_points,
          referee_points: ref.referee_points,
          created_at: ref.created_at,
        })),
      },
      errors: [],
    };
  }
}
