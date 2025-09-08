import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as dayjs from 'dayjs';
import { User } from 'src/users/entities/user.entity';
import { ILike, IsNull, Not, Repository } from 'typeorm';
import { CreateWalletOrderDto } from '../dto/create-wallet-order.dto';
import { CreateWalletSettingsDto } from '../dto/create-wallet-settings.dto';
import { CreateWalletTransactionDto } from '../dto/create-wallet-transaction.dto';
import { CreateWalletDto } from '../dto/create-wallet.dto';
import { CouponStatus, UserCoupon } from '../entities/user-coupon.entity';
import { WalletOrder } from '../entities/wallet-order.entity';
import {
  ExpirationMethod,
  WalletSettings,
} from '../entities/wallet-settings.entity';
import {
  WalletTransaction,
  WalletTransactionType,
} from '../entities/wallet-transaction.entity';
import { Wallet } from '../entities/wallet.entity';

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
    @InjectRepository(WalletOrder)
    private orderRepo: Repository<WalletOrder>,
  ) {}

  async createWallet(dto: CreateWalletDto) {
    const wallet = this.walletRepo.create({
      ...dto,
      customer: { id: dto.customer_id } as any,
      business_unit: { id: dto.business_unit_id } as any,
      tenant: { id: dto.tenant_id } as any,
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

      const isSuperAdmin = privileges.some(
        (p: any) => p.name === 'all_tenants',
      );

      // check for global business unit access for this tenant
      const hasGlobalBusinessUnitAccess = privileges.some(
        (p) =>
          p.module === 'businessUnits' && p.name.includes('_All Business Unit'),
      );

      if (!hasGlobalBusinessUnitAccess && !isSuperAdmin) {
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

    const transactionPayload = {
      ...dto,
      business_unit: { id: dto.business_unit_id } as any,
      point_balance: wallet.available_balance,
      wallet: { id: dto.wallet_id } as any,
      unlock_date: unlockDate,
      expiry_date: expiryDate,
    };

    if (dto.wallet_order_id) {
      transactionPayload['orders'] = { id: dto.wallet_order_id };
    }

    const transaction = this.txRepo.create(transactionPayload);
    const savedTx = await this.txRepo.save(transaction);

    if (dto.status === 'active') {
      switch (dto.type) {
        case 'earn':
          wallet.total_balance += amount;
          wallet.available_balance += amount;
          break;
        case 'burn':
          wallet.available_balance -= amount;
          break;
        case 'expire':
          wallet.available_balance -= amount;
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

  async getWalletTransactionsOld(walletId: number) {
    return this.txRepo.find({ where: { wallet: { id: walletId } } });
  }

  async getWalletTransactions(
    walletId: number,
    page: number = 1,
    pageSize: number = 7,
    query: string = '',
    transactionType: string = '',
  ) {
    const take = pageSize;
    const skip = (page - 1) * take;

    let whereClause: any;
    if (transactionType === 'points') {
      // points = source_type != 'coupon' OR source_type IS NULL
      whereClause = [
        { wallet: { id: walletId }, source_type: Not('coupon') },
        { wallet: { id: walletId }, source_type: IsNull() },
      ];
    } else if (transactionType === 'coupon') {
      whereClause = { wallet: { id: walletId }, source_type: 'coupon' };
    } else {
      whereClause = { wallet: { id: walletId } };
    }

    if (query) {
      const searchTerm = `%${query}%`;
      const searchFields = ['type', 'amount', 'status', 'description'];

      if (Array.isArray(whereClause)) {
        whereClause = whereClause.flatMap((cond) =>
          searchFields.map((field) => ({
            ...cond,
            [field]: ILike(searchTerm),
          })),
        );
      } else {
        whereClause = searchFields.map((field) => ({
          ...whereClause,
          [field]: ILike(searchTerm),
        }));
      }
    }

    const [data, total] = await this.txRepo.findAndCount({
      where: whereClause,
      relations: ['orders'],
      take,
      skip,
    });
    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async listWallets(
    client_id: number,
    buId?: number,
    page: number = 1,
    pageSize: number = 10,
  ) {
    const take = pageSize;
    const skip = (page - 1) * take;

    const where: any = {
      tenant: { id: client_id },
      ...(buId ? { business_unit: { id: buId } } : {}),
    };

    const [data, total] = await this.walletRepo.findAndCount({
      relations: ['business_unit', 'customer'],
      where,
      take,
      skip,
      order: { created_at: 'DESC' },
    });

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getSettingsByBusinessUnit(buId: number) {
    return this.settingsRepo.findOne({
      where: { business_unit: { id: buId } },
      relations: ['business_unit', 'created_by'],
    });
  }

  async getAllWalltetSettings(client_id: number) {
    return this.settingsRepo.find({
      where: {
        tenant: { id: client_id },
      },
      relations: ['business_unit', 'created_by'],
    });
  }

  async saveOrUpdateSettings(client_id: number, dto: CreateWalletSettingsDto) {
    let setting = await this.settingsRepo.findOne({
      where: { business_unit: { id: dto.business_unit_id } },
    });

    if (!setting) {
      setting = this.settingsRepo.create({
        ...dto,
        business_unit: { id: dto.business_unit_id },
        tenant: { id: client_id },
        created_by: { id: dto.created_by },
      });
    } else {
      this.settingsRepo.merge(setting, {
        ...dto,
        business_unit: { id: dto.business_unit_id },
        tenant: { id: client_id },
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

  async getSingleCustomerWalletInfoById(customerId) {
    return this.walletRepo.findOne({
      where: {
        customer: { id: customerId },
      },
    });
  }

  async addOrder(dto: CreateWalletOrderDto) {
    const order = this.orderRepo.create({
      ...dto,
      wallet: { id: dto.wallet_id },
      business_unit: { id: dto.business_unit_id },
    });
    return await this.orderRepo.save(order);
  }

  async updateWalletBalances(
    walletId: number,
    obj: {
      available_balance?: number;
      locked_balance?: number;
      total_balance?: number;
    },
  ) {
    const wallet = await this.walletRepo.findOne({ where: { id: walletId } });
    if (!wallet) {
      throw new BadRequestException('Wallet not found');
    }

    if (typeof obj.available_balance === 'number') {
      wallet.available_balance = obj.available_balance;
    }
    if (typeof obj.locked_balance === 'number') {
      wallet.locked_balance = obj.locked_balance;
    }
    if (typeof obj.total_balance === 'number') {
      wallet.total_balance = obj.total_balance;
    }

    const data = await this.walletRepo.save(wallet);
    return data;
  }
}
