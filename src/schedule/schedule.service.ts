import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Campaign } from 'src/campaigns/entities/campaign.entity';
import { Coupon } from 'src/coupons/entities/coupon.entity';
import * as os from 'os';
import * as newrelic from 'newrelic';
import { GateWayLog } from 'src/gateway-logs/entities/log.entity';
import { Log } from 'src/logs/entities/log.entity';
import {
  WalletTransaction,
  WalletTransactionStatus,
  WalletTransactionType,
} from 'src/wallet/entities/wallet-transaction.entity';
import { WalletService } from 'src/wallet/wallet/wallet.service';
import { In, LessThan, LessThanOrEqual, Repository } from 'typeorm';

@Injectable()
export class ScheduleService {
  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(WalletTransaction)
    private readonly txRepo: Repository<WalletTransaction>,
    @InjectRepository(Log)
    private readonly logRepository: Repository<Log>,
    @InjectRepository(GateWayLog)
    private readonly gatewayLogRepository: Repository<GateWayLog>,
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
    return newrelic.startBackgroundTransaction(
      'campaignExpiry',
      'Cron',
      async () => {
        const tx = newrelic.getTransaction();

        try {
          const hostName = os.hostname();
          const localUrl = 'http://localhost:3000';
          if (
            process.env.PROD_SERVER_HOST_NAME === hostName ||
            process.env.DEV_SERVER_HOST_NAME === hostName ||
            process.env.UAT_SERVER_HOST_NAME === hostName ||
            process.env.LOCAL_SERVER_HOST_NAME === localUrl
          ) {
            // Set 'today' to midnight (00:00:00) to match campaigns ending today
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            console.log('Running campaign expiry check...');

            const qb = this.campaignRepository
              .createQueryBuilder('campaign')
              .leftJoinAndSelect('campaign.locales', 'locale')
              .where('campaign.end_date = :today', { today })
              .andWhere('campaign.active = :active', { active: true });
            // .andWhere('locale.language_code = :langCode', { langCode: 'en' });

            const expiredCampaigns: any = await qb.getMany();

            for (const campaign of expiredCampaigns) {
              campaign.active = false;
              await this.campaignRepository.save(campaign);
              console.log(
                `Deactivated campaign: ${campaign?.locales?.[0]?.name}`,
              );
            }
          }
        } catch (error) {
          newrelic.noticeError(error);
          console.error('Campaign expiry cron error:', error);
        } finally {
          tx.end();
        }
      },
    );
  }

  // Cron job to remove logs older than 30 days
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async removeOldLogs() {
    return newrelic.startBackgroundTransaction(
      'removeOldLogs',
      'Cron',
      async () => {
        const tx = newrelic.getTransaction();

        try {
          const hostName = os.hostname();
          const localUrl = 'http://localhost:3000';
          if (
            process.env.PROD_SERVER_HOST_NAME === hostName ||
            process.env.DEV_SERVER_HOST_NAME === hostName ||
            process.env.UAT_SERVER_HOST_NAME === hostName ||
            process.env.LOCAL_SERVER_HOST_NAME === localUrl
          ) {
            const date = new Date();
            date.setDate(date.getDate() - 30);

            try {
              const result = await this.logRepository.delete({
                createdAt: LessThan(date),
              });
              console.log(`Deleted ${result.affected} old logs.`);

              const result1 = await this.gatewayLogRepository.delete({
                createdAt: LessThan(date),
              });
              console.log(`Deleted ${result1.affected} old gateway logs.`);
            } catch (error) {
              console.error('Error deleting old logs:', error);
            }
          }
        } catch (error) {
          newrelic.noticeError(error);
          console.error('Remove old logs cron error:', error);
        } finally {
          tx.end();
        }
      },
    );
  }

  // @Cron(CronExpression.EVERY_HOUR)
  // async markExpiredCoupons() {
  // console.log('Running coupon expiry check...');
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
  // }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async unLockWalletPointsAndAddThemInAvailableBalance() {
    return newrelic.startBackgroundTransaction(
      'unlockWalletPoints',
      'Cron',
      async () => {
        const tx = newrelic.getTransaction();

        try {
          const hostName = os.hostname();
          const localUrl = 'http://localhost:3000';
          if (
            process.env.PROD_SERVER_HOST_NAME === hostName ||
            process.env.DEV_SERVER_HOST_NAME === hostName ||
            process.env.UAT_SERVER_HOST_NAME === hostName ||
            process.env.LOCAL_SERVER_HOST_NAME === localUrl
          ) {
            console.log(
              'Cron Unlock Wallet Points And AddThem In Available Balance',
            );
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

            for (const transaction of transactionsToUnlock) {
              const wallet = transaction.wallet;
              if (!wallet) continue;

              // Move points from locked_balance to available_balance, so picking how much locked points are for this transaction
              const point_balance = Number(transaction.point_balance);
              // Update wallet balances
              wallet.locked_balance =
                Number(wallet.locked_balance) - point_balance;
              wallet.available_balance =
                Number(wallet.available_balance) + point_balance;
              // Update transaction status to 'active'
              transaction.status = WalletTransactionStatus.ACTIVE;

              // Save changes
              await this.walletService.updateWalletBalances(wallet.id, {
                ...wallet,
              });
              await this.txRepo.save(transaction);
            }
          }
        } catch (error) {
          newrelic.noticeError(error);
          console.error('Unlock wallet points cron error:', error);
        } finally {
          tx.end();
        }
      },
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async deleteExpiredWalletPoints() {
    return newrelic.startBackgroundTransaction(
      'deleteExpiredWalletPoints',
      'Cron',
      async () => {
        const tx = newrelic.getTransaction();

        try {
          const hostName = os.hostname();
          const localUrl = 'http://localhost:3000';
          if (
            process.env.PROD_SERVER_HOST_NAME === hostName ||
            process.env.DEV_SERVER_HOST_NAME === hostName ||
            process.env.UAT_SERVER_HOST_NAME === hostName ||
            process.env.LOCAL_SERVER_HOST_NAME === localUrl
          ) {
            console.log('Running wallet points expiry check...');

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // all transactions that are expiring today or earlier
            // Make two separate calls: one for expiry_date (new records) and one for expires_at (migration records)
            const expiringByExpiryDate = await this.txRepo.find({
              where: {
                expiry_date: LessThanOrEqual(today),
                status: WalletTransactionStatus.ACTIVE,
                type: In([
                  WalletTransactionType.EARN,
                  WalletTransactionType.ADJUSTMENT,
                ]),
              },
              relations: ['wallet', 'wallet.business_unit'],
            });

            const expiringByExpiresAt = await this.txRepo.find({
              where: {
                expires_at: LessThanOrEqual(today),
                status: WalletTransactionStatus.ACTIVE,
                type: In([
                  WalletTransactionType.EARN,
                  WalletTransactionType.ADJUSTMENT,
                ]),
              },
              relations: ['wallet', 'wallet.business_unit'],
            });

            // Combine and deduplicate based on transaction ID
            const combinedMap = new Map<number, WalletTransaction>();
            [...expiringByExpiryDate, ...expiringByExpiresAt].forEach((tx) => {
              combinedMap.set(tx.id, tx);
            });

            // Convert back to array and sort by created_at for FIFO processing
            const expiringTransactions = Array.from(combinedMap.values()).sort(
              (a, b) => a.created_at.getTime() - b.created_at.getTime(),
            );

            for (const tx of expiringTransactions) {
              const wallet = tx.wallet;
              if (!wallet) continue;

              // Get all earned points created before or at the same time as this transaction
              // GEt all earniing till this transaction created_at, this will give us all transactions that were available before this tx
              const earnedBeforeOrAt = await this.txRepo.find({
                where: {
                  wallet: { id: wallet.id },
                  type: In([
                    WalletTransactionType.EARN,
                    WalletTransactionType.ADJUSTMENT,
                  ]),
                  created_at: LessThanOrEqual(tx.created_at),
                  // status: WalletTransactionStatus.ACTIVE,
                },
                order: { created_at: 'ASC' },
              });

              // Calculate how many points were available before this transaction
              const pointsBeforeThisTx = earnedBeforeOrAt
                .filter((e) => e.id !== tx.id)
                .reduce((sum, e) => sum + Number(e.point_balance || 0), 0);

              // 🔢 Calculate how many points from THIS transaction were consumed using FIFO logic
              //
              // FIFO Rule: When customers spend points, oldest points are consumed first.
              //
              // Example scenario:
              // - Customer earned 100 points on Jan 1 (older)
              // - Customer earned 50 points on Jan 15 (this transaction, expiring now)
              // - Customer has burned 120 points total
              //
              // Logic breakdown:
              // 1. total_burned_points (120) - pointsBeforeThisTx (100) = 20 points consumed from this tx
              // 2. Math.min ensures we don't exceed the transaction's point_balance (50)
              // 3. Math.max ensures we never get negative values (if all burns came from older transactions)
              //
              // Result: 20 points from this transaction were consumed, 30 points remain unused and will expire
              const consumedFromThisTx = Math.max(
                0,
                Math.min(
                  Number(tx.point_balance),
                  wallet.total_burned_points - pointsBeforeThisTx,
                ),
              );

              // Calculate unused points that should expire
              // If 20 points were consumed from a 50-point transaction, 30 points are unused
              const unusedPoints =
                Number(tx.point_balance) - consumedFromThisTx;

              if (unusedPoints > 0) {
                // Create EXPIRE transaction
                await this.walletService.addTransaction(
                  {
                    wallet_id: wallet.id,
                    business_unit_id: wallet.business_unit.id,
                    type: WalletTransactionType.EXPIRE,
                    amount: 0,
                    status: WalletTransactionStatus.ACTIVE,
                    description: `Expired ${unusedPoints} unused points from transaction ${tx.id}`,
                    source_type: 'system',
                    source_id: tx.id,
                    prev_available_points: wallet.available_balance,
                    points_balance: unusedPoints,
                    external_program_type: 'Loyalty Points Expiry Cron',
                    created_at: new Date(),
                    expiry_date: null,
                  },
                  null,
                  true,
                );

                console.log(
                  `Wallet ${wallet.id}: Expired ${unusedPoints}/${tx.point_balance} points from transaction ${tx.id}`,
                );
              }

              // Finally, mark the original transaction as EXPIRED
              tx.status = WalletTransactionStatus.EXPIRED;
              await this.txRepo.save(tx);
            }
          }
        } catch (error) {
          newrelic.noticeError(error);
          console.error('Delete expired wallet points cron error:', error);
        } finally {
          tx.end();
        }
      },
    );
  }

  // // TODO: I think we don't need this cron as we are handling expiry in the above cron
  // @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  // async walletPointsExpiryCron() {
  //   const hostName = os.hostname();
  //   const localUrl = 'http://localhost:3000';
  //   if (
  //     process.env.PROD_SERVER_HOST_NAME === hostName ||
  //     process.env.DEV_SERVER_HOST_NAME === hostName ||
  //     process.env.UAT_SERVER_HOST_NAME === hostName ||
  //     process.env.LOCAL_SERVER_HOST_NAME === localUrl
  //   ) {
  //     console.log('Wallet expire points cron started');

  //     // Get start of today (midnight) to compare expiry dates
  //     const today = new Date();
  //     today.setHours(0, 0, 0, 0);

  //     // 1. Find all active EARN transactions whose points should expire today or earlier
  //     const transactionsToExpire = await this.txRepo.find({
  //       where: {
  //         expiry_date: LessThanOrEqual(today),
  //         status: WalletTransactionStatus.ACTIVE,
  //         type: WalletTransactionType.EARN,
  //       },
  //       relations: ['wallet'],
  //     });

  //     // console.log('transactionsToExpire :::', transactionsToExpire);

  //     // 2. Process each transaction
  //     for (const tx of transactionsToExpire) {
  //       const wallet = tx.wallet;
  //       if (!wallet) continue; // Skip if wallet relation is missing

  //       const point_balance = Number(tx.point_balance);

  //       // Move expired points from available to locked balance
  //       wallet.available_balance =
  //         Number(wallet.available_balance) - point_balance;
  //       wallet.locked_balance = Number(wallet.locked_balance) + point_balance;

  //       // Mark transaction as expired
  //       tx.status = WalletTransactionStatus.EXPIRED;

  //       // Save changes
  //       await this.walletService.updateWalletBalances(wallet.id, { ...wallet });
  //       await this.txRepo.save(tx);
  //     }
  //   }
  // }
}
