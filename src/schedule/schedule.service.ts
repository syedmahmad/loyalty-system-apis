import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Campaign } from 'src/campaigns/entities/campaign.entity';
import { Coupon } from 'src/coupons/entities/coupon.entity';
import { Log } from 'src/logs/entities/log.entity';
import {
  WalletTransaction,
  WalletTransactionStatus,
  WalletTransactionType,
} from 'src/wallet/entities/wallet-transaction.entity';
import { WalletService } from 'src/wallet/wallet/wallet.service';
import {
  Between,
  In,
  LessThan,
  LessThanOrEqual,
  Not,
  Repository,
} from 'typeorm';

@Injectable()
export class ScheduleService {
  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(WalletTransaction)
    private readonly txRepo: Repository<WalletTransaction>,
    @InjectRepository(Log)
    private readonly logRepository: Repository<Log>,
    @InjectRepository(Coupon)
    private readonly couponsRepository: Repository<Coupon>,
    private readonly walletService: WalletService,
  ) {}

  /**
   * Scheduled task that runs every day at midnight to check for expired campaigns.
   *
   * - Finds all campaigns that have an end_date equal to today and are still active.
   * - Deactivates each expired campaign by setting its 'active' property to false.
   * - Saves the updated campaign and logs the deactivation.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    // Set 'today' to midnight (00:00:00) to match campaigns ending today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    console.log('Running campaign expiry check...');

    const expiredCampaigns = await this.campaignRepository.find({
      where: { end_date: today, active: true },
    });

    for (const campaign of expiredCampaigns) {
      campaign.active = false;
      await this.campaignRepository.save(campaign);
      console.log(`Deactivated campaign: ${campaign.name}`);
    }
  }

  // Cron job to remove logs older than 30 days
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async removeOldLogs() {
    const date = new Date();
    date.setDate(date.getDate() - 30);

    try {
      const result = await this.logRepository.delete({
        createdAt: LessThan(date),
      });
      console.log(`Deleted ${result.affected} old logs.`);
    } catch (error) {
      console.error('Error deleting old logs:', error);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async markExpiredCoupons() {
    console.log('Running coupon expiry check...');
    // const today = new Date();
    // today.setHours(0, 0, 0, 0);

    // const expiredCoupons = await this.couponsRepository.find({
    //   where: { date_to: LessThanOrEqual(today), status: 1 },
    // });

    // for (const coupon of expiredCoupons) {
    //   coupon.status = 0;
    //   await this.couponsRepository.save(coupon);
    //   console.log(`Deactivated coupon: ${coupon.coupon_title}`);
    // }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async unLockWalletPointsAndAddThemInAvailableBalance() {
    console.log('Cron Unlock Wallet Points And AddThem In Available Balance');
    // 1. Find all wallet transactions where unlock_date is today or earlier and status is 'pending'
    // const today = new Date();

    // Find all transactions that should be unlocked
    // To handle date-only unlock_date (e.g., '2025-08-12') vs. JS Date (with time),
    // we need to find all transactions where unlock_date is <= today (date part only).
    // We'll use a raw query or Between/LessThanOrEqual with date string.
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of today
    const transactionsToUnlock = await this.txRepo.find({
      where: {
        unlock_date: LessThanOrEqual(today),
        status: WalletTransactionStatus.PENDING,
        type: WalletTransactionType.EARN,
      },
      relations: ['wallet'],
    });

    // console.log('transactionsToUnlock', transactionsToUnlock, today);

    for (const tx of transactionsToUnlock) {
      const wallet = tx.wallet;
      if (!wallet) continue;

      // Move points from locked_balance to available_balance, so picking how much locked points are for this transaction
      const amount = Number(tx.amount);
      // Update wallet balances
      wallet.locked_balance = Number(wallet.locked_balance) - amount;
      wallet.available_balance = Number(wallet.available_balance) + amount;
      // Update transaction status to 'active'
      tx.status = WalletTransactionStatus.ACTIVE;

      // Save changes
      await this.walletService.updateWalletBalances(wallet.id, {
        ...wallet,
      });
      await this.txRepo.save(tx);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async deleteExpiredWalletPoints() {
    console.log('Running wallet points expiry check...');

    const today = new Date(); // or however you get your date
    today.setHours(0, 0, 0, 0);

    // getting all transactions that are active and have expiry_date equal to today
    // and type is 'earn'
    const expiringTransactions = await this.txRepo.find({
      where: {
        expiry_date: LessThanOrEqual(today),
        status: WalletTransactionStatus.ACTIVE,
        type: In([
          WalletTransactionType.EARN,
          WalletTransactionType.ADJUSTMENT,
        ]),
      },
      relations: ['wallet'],
    });

    for (const tx of expiringTransactions) {
      const wallet = tx.wallet;
      if (!wallet) continue;

      // 1️⃣ Get all earned + adjustment points in the transaction's lifetime
      const earnedTxs = await this.txRepo.find({
        where: {
          id: Not(tx.id), // Exclude the current transaction
          wallet: { id: wallet.id },
          type: In([
            WalletTransactionType.EARN,
            WalletTransactionType.ADJUSTMENT,
          ]),
          created_at: Between(tx.created_at, tx.expiry_date),
          status: WalletTransactionStatus.ACTIVE,
        },
      });

      const totalEarned = earnedTxs.reduce(
        (sum, e) => sum + Number(e.amount),
        0,
      );
      const availableBalance = Number(wallet.available_balance);
      const remainingPastBalance = availableBalance - totalEarned;
      const hasSpentSomething = remainingPastBalance > tx.point_balance;

      if (hasSpentSomething) {
        // 2️⃣ Calculate unused portion of THIS expiring transaction
        let unusedPoints = remainingPastBalance - Number(tx.point_balance);
        if (unusedPoints < 0) unusedPoints = 0;

        // 3️⃣ Deduct unused portion via addTransaction
        if (unusedPoints > 0) {
          await this.walletService.addTransaction(
            {
              wallet_id: wallet.id,
              business_unit_id: wallet.business_unit.id,
              type: WalletTransactionType.EXPIRE,
              amount: unusedPoints,
              status: WalletTransactionStatus.ACTIVE,
              description: `Expired ${unusedPoints} unused points from transaction ${tx.id}`,
              source_type: 'system',
              source_id: tx.id, // Link to the original transaction
            },
            null, // system user ID or dedicated service account
            true, // callingFromGateway = true to skip permission checks
          );
        }
        console.log(`Expired ${unusedPoints} points for wallet ${wallet.id}`);
      }
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async walletPointsExpiryCron() {
    console.log('Wallet expire points cron started');

    // Get start of today (midnight) to compare expiry dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Find all active EARN transactions whose points should expire today or earlier
    const transactionsToExpire = await this.txRepo.find({
      where: {
        expiry_date: LessThanOrEqual(today),
        status: WalletTransactionStatus.ACTIVE,
        type: WalletTransactionType.EARN,
      },
      relations: ['wallet'],
    });

    // console.log('transactionsToExpire :::', transactionsToExpire);

    // 2. Process each transaction
    for (const tx of transactionsToExpire) {
      const wallet = tx.wallet;
      if (!wallet) continue; // Skip if wallet relation is missing

      const amount = Number(tx.amount);

      // Move expired points from available to locked balance
      wallet.available_balance = Number(wallet.available_balance) - amount;
      wallet.locked_balance = Number(wallet.locked_balance) + amount;

      // Mark transaction as expired
      tx.status = WalletTransactionStatus.EXPIRED;

      // Save changes
      await this.walletService.updateWalletBalances(wallet.id, { ...wallet });
      await this.txRepo.save(tx);
    }
  }
}
