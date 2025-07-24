import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Wallet } from '../entities/wallet.entity';
import {
  WalletTransaction,
  WalletTransactionType,
} from '../entities/wallet-transaction.entity';
import { CouponStatus, UserCoupon } from '../entities/user-coupon.entity';
import {
  WalletSettings,
  ExpirationMethod,
} from '../entities/wallet-settings.entity';
import { Repository } from 'typeorm';
import { CreateWalletDto } from '../dto/create-wallet.dto';
import { CreateWalletTransactionDto } from '../dto/create-wallet-transaction.dto';
import * as dayjs from 'dayjs';
import { CreateWalletSettingsDto } from '../dto/create-wallet-settings.dto';
import { User } from 'src/users/entities/user.entity';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet) private walletRepo: Repository<Wallet>,
    @InjectRepository(WalletTransaction)
    private txRepo: Repository<WalletTransaction>,
    @InjectRepository(WalletSettings)
    private settingsRepo: Repository<WalletSettings>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserCoupon) private couponRepo: Repository<UserCoupon>,
  ) {}

  async createWallet(dto: CreateWalletDto) {
    const wallet = this.walletRepo.create({
      ...dto,
      customer: { id: dto.customer_id } as any,
      business_unit: { id: dto.business_unit_id } as any,
    });

    return this.walletRepo.save(wallet);
  }

  async addTransaction(
    dto: CreateWalletTransactionDto,
    userId: number,
    callingFromgateway = false,
  ) {
    if (!callingFromgateway) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        throw new BadRequestException('User not found against user-token');
      }

      const privileges: any[] = user.user_privileges || [];

      // check for global business unit access for this tenant
      const hasGlobalBusinessUnitAccess = privileges.some(
        (p) =>
          p.module === 'businessUnits' && p.name.includes('_All Business Unit'),
      );

      if (!hasGlobalBusinessUnitAccess) {
        throw new BadRequestException(
          'User does not have permission to perform this action',
        );
      }
    }

    const wallet = await this.walletRepo.findOne({
      where: { id: dto.wallet_id },
      relations: ['business_unit'],
    });

    if (!wallet) {
      throw new BadRequestException('Wallet not found');
    }

    const settings = await this.settingsRepo.findOne({
      where: { business_unit: { id: wallet.business_unit.id } },
    });

    let unlockDate: Date = null;
    let expiryDate: Date = null;

    if (dto.coupon_code) {
      const coupon = await this.couponRepo.findOne({
        where: { coupon_code: dto.coupon_code, status: CouponStatus.ISSUED },
      });

      if (!coupon)
        throw new BadRequestException('Invalid or already used coupon');
      if (coupon.expires_at && new Date() > coupon.expires_at) {
        throw new BadRequestException('Coupon expired');
      }

      coupon.status = CouponStatus.USED;
      coupon.redeemed_at = new Date();
      await this.couponRepo.save(coupon);

      dto.source_type = 'coupon';
      dto.source_id = coupon.id;
    }

    if (
      dto.type === WalletTransactionType.EARN &&
      settings?.pending_method === 'fixed_days' &&
      settings.pending_days
    ) {
      unlockDate = dayjs().add(settings.pending_days, 'day').toDate();
    }

    if (
      settings?.expiration_method &&
      dto.type === WalletTransactionType.EARN
    ) {
      const baseDate = unlockDate || new Date();
      switch (settings.expiration_method) {
        case ExpirationMethod.FIXED_DAYS:
          expiryDate = dayjs(baseDate)
            .add(Number(settings.expiration_value), 'day')
            .toDate();
          break;
        case ExpirationMethod.END_OF_MONTH:
          expiryDate = dayjs(baseDate).endOf('month').toDate();
          break;
        case ExpirationMethod.END_OF_YEAR:
          expiryDate = dayjs(baseDate).endOf('year').toDate();
          break;
        case ExpirationMethod.ANNUAL_DATE:
          expiryDate = dayjs(
            `${dayjs().year()}-${settings.expiration_value}`,
          ).toDate();
          break;
      }
    }

    if (dto?.expiry_date) {
      expiryDate = dto?.expiry_date;
    }

    const amount = Number(dto.amount);

    if (
      dto.type === WalletTransactionType.BURN &&
      !settings?.allow_negative_balance &&
      wallet.available_balance < amount
    ) {
      throw new BadRequestException('Insufficient balance');
    }

    const transaction = this.txRepo.create({
      ...dto,
      business_unit: { id: dto.business_unit_id } as any,
      wallet: { id: dto.wallet_id } as any,
      unlock_date: unlockDate,
      expiry_date: expiryDate,
    });
    const savedTx = await this.txRepo.save(transaction);

    if (dto.status === 'active') {
      switch (dto.type) {
        case 'earn':
          wallet.total_balance += amount;
          wallet.available_balance += amount;
          break;
        case 'burn':
          wallet.total_balance -= amount;
          wallet.available_balance -= amount;
          break;
        case 'expire':
          wallet.total_balance -= amount;
          break;
        case 'adjustment':
          wallet.total_balance += amount;
          wallet.available_balance += amount;
          break;
      }
      await this.walletRepo.save(wallet);
    } else if (dto.status === 'pending') {
      wallet.total_balance += amount;
      wallet.locked_balance += amount;
      await this.walletRepo.save(wallet);
    }

    return savedTx;
  }

  async getWalletTransactions(walletId: number) {
    return this.txRepo.find({ where: { wallet: { id: walletId } } });
  }

  async listWallets(buId?: number) {
    const where = buId ? { business_unit: { id: buId } } : {};
    return this.walletRepo.find({
      where,
      relations: ['business_unit', 'customer'],
      order: { created_at: 'DESC' },
    });
  }

  async getSettingsByBusinessUnit(buId: number) {
    return this.settingsRepo.findOne({
      where: { business_unit: { id: buId } },
    });
  }

  async saveOrUpdateSettings(dto: CreateWalletSettingsDto) {
    let setting = await this.settingsRepo.findOne({
      where: { business_unit: { id: dto.business_unit_id } },
    });

    if (!setting) {
      setting = this.settingsRepo.create({
        ...dto,
        business_unit: { id: dto.business_unit_id },
        created_by: { id: dto.created_by },
      });
    } else {
      this.settingsRepo.merge(setting, {
        ...dto,
        business_unit: { id: dto.business_unit_id },
        created_by: { id: dto.created_by },
      });
    }
    return this.settingsRepo.save(setting);
  }

  async getSingleCustomerWalletInfo(customerId, buId) {
    return this.walletRepo.findOne({
      where: {
        customer: { id: customerId },
        business_unit: { id: buId },
      },
    });
  }
}
