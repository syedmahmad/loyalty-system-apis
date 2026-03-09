import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { WalletTransaction } from 'src/wallet/entities/wallet-transaction.entity';
import { Repository } from 'typeorm';
import { Coupon } from 'src/coupons/entities/coupon.entity';
import { UserCoupon } from 'src/wallet/entities/user-coupon.entity';
import { CouponUsage } from 'src/coupons/entities/coupon-usages.entity';

@Injectable()
export class LoyaltyAnalyticsService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,

    @InjectRepository(WalletTransaction)
    private readonly walletTransactionRepository: Repository<WalletTransaction>,

    @InjectRepository(Coupon)
    private readonly couponRepository: Repository<Coupon>,

    @InjectRepository(UserCoupon)
    private userCouponRepository: Repository<UserCoupon>,

    @InjectRepository(CouponUsage)
    private couponUsageRepo: Repository<CouponUsage>,
  ) {}

  async pointsSplit(permission: any, startDate?: string, endDate?: string) {
    if (!permission.canViewAnalytics) {
      throw new BadRequestException(
        "You don't have permission to access analytics",
      );
    }
    // Fetch each analytic serially to prevent Out Of Memory (OOM) errors.
    // Note: This mitigates memory spikes, but may increase response time since metrics are not loaded in parallel.
    const pointSplits = await this.getPointsSplit(startDate, endDate);
    return {
      pointSplits,
    };
  }

  async getCustomerByPoints(permission: any) {
    if (!permission.canViewAnalytics) {
      throw new BadRequestException(
        "You don't have permission to access analytics",
      );
    }
    const customerByPoints = await this.getCustomerPointDistribution();
    return {
      customerByPoints,
    };
  }

  async getSummary(permission: any, startDate?: string, endDate?: string) {
    if (!permission.canViewAnalytics) {
      throw new BadRequestException(
        "You don't have permission to access analytics",
      );
    }
    const summary = await this.getPointSummary(startDate, endDate);
    return {
      summary,
    };
  }

  async itemUsage(permission: any, startDate?: string, endDate?: string) {
    if (!permission.canViewAnalytics) {
      throw new BadRequestException(
        "You don't have permission to access analytics",
      );
    }
    const itemUsage = await this.getItemUsage(startDate, endDate);
    return {
      itemUsage,
    };
  }

  async barChart(permission: any, startDate?: string, endDate?: string) {
    if (!permission.canViewAnalytics) {
      throw new BadRequestException(
        "You don't have permission to access analytics",
      );
    }
    const barChart = await this.getBarChartData(startDate, endDate);
    return {
      barChart,
    };
  }

  private async getPointsSplit(startDate?: string, endDate?: string) {
    const qb = this.walletTransactionRepository
      .createQueryBuilder('tx')
      .select('tx.source_type', 'sourceType')
      .addSelect('SUM(tx.point_balance)', 'totalPoints')
      .where('tx.type IN (:...types)', { types: ['earn', 'adjustment'] })
      .andWhere('tx.status = :status', { status: 'active' });

    if (startDate && endDate) {
      qb.andWhere('tx.created_at BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      });
    }

    return qb.groupBy('tx.source_type').getRawMany();
  }

  private async getCustomerPointDistribution() {
    const { total } = await this.walletRepository
      .createQueryBuilder('wallet')
      .select('COUNT(*)', 'total')
      .getRawOne();

    const ranges = await this.walletRepository.query(`
      SELECT 
        CASE
          WHEN total_balance BETWEEN 0 AND 1000 THEN '0-1,000'
          WHEN total_balance BETWEEN 1001 AND 2000 THEN '1,001-2,000'
          WHEN total_balance BETWEEN 2001 AND 5000 THEN '2,001-5,000'
          ELSE '5,001+'
        END AS \`range\`,
        COUNT(*) AS count
      FROM wallet
      GROUP BY \`range\`
    `);

    return ranges.map((r: any) => ({
      ...r,
      percentage: total ? ((r.count / total) * 100).toFixed(2) + '%' : '0%',
    }));
  }

  private async getPointSummary(startDate?: string, endDate?: string) {
    const earnQb = this.walletTransactionRepository
      .createQueryBuilder('tx')
      .select('SUM(tx.point_balance)', 'totalEarned')
      .where('tx.type = :type', { type: 'earn' })
      .andWhere('tx.status = :status', { status: 'active' });

    const activeBurnQb = this.walletTransactionRepository
      .createQueryBuilder('tx')
      .select('SUM(tx.point_balance)', 'totalBurnt')
      .where('tx.type = :type', { type: 'burn' })
      .andWhere('tx.status = :status', { status: 'active' });

    const notConfirmedBurnQb = this.walletTransactionRepository
      .createQueryBuilder('tx')
      .select('SUM(tx.point_balance)', 'totalNotConfirmedBurnt')
      .where('tx.type = :type', { type: 'burn' })
      .andWhere('tx.status = :status', { status: 'not_confirmed' });

    if (startDate && endDate) {
      earnQb.andWhere('tx.created_at BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      });
      activeBurnQb.andWhere('tx.created_at BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      });
      notConfirmedBurnQb.andWhere('tx.created_at BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      });
    }

    const [
      earnedResult,
      remainingResult,
      activeBurnResult,
      notConfirmedBurnResult,
    ] = await Promise.all([
      earnQb.getRawOne(),
      this.walletRepository
        .createQueryBuilder('wallet')
        .select('SUM(wallet.available_balance)', 'totalRemaining')
        .getRawOne(),
      activeBurnQb.getRawOne(),
      notConfirmedBurnQb.getRawOne(),
    ]);

    const totalEarned = parseFloat(earnedResult?.totalEarned || 0);
    const totalRemaining = parseFloat(remainingResult?.totalRemaining || 0);
    const totalBurnt = parseFloat(activeBurnResult?.totalBurnt || 0);
    const totalNotConfirmedBurnt = parseFloat(
      notConfirmedBurnResult?.totalNotConfirmedBurnt || 0,
    );

    return {
      totalEarnedPoints: totalEarned,
      totalBurntPoints: totalBurnt,
      totalNotConfirmedBurntPoints: totalNotConfirmedBurnt,
      totalLoyaltyPoints: totalEarned - totalBurnt,
      totalRemainingPoints: totalRemaining,
    };
  }

  private async getItemUsage(startDate?: string, endDate?: string) {
    const qb = this.walletTransactionRepository
      .createQueryBuilder('tx')
      .select('tx.source_type', 'sourceType')
      .addSelect('COUNT(*)', 'transactionCount')
      .addSelect('SUM(tx.point_balance)', 'totalPoints')
      .addSelect('SUM(tx.amount)', 'totalAmount')
      .where('tx.type = :type', { type: 'earn' })
      .andWhere('tx.status = :status', { status: 'active' });

    if (startDate && endDate) {
      qb.andWhere('tx.created_at BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      });
    }

    const rows = await qb.groupBy('tx.source_type').getRawMany();

    return rows.map((r) => ({
      sourceType: r.sourceType,
      transactionCount: Number(r.transactionCount),
      totalPoints: Number(r.totalPoints || 0),
      totalAmount: r.totalAmount != null ? Number(r.totalAmount) : null,
    }));
  }

  private async getBarChartData(startDate?: string, endDate?: string) {
    /*
    const whereClause: any = {};
    if (startDate && endDate) {
      whereClause.created_at = Between(new Date(startDate), new Date(endDate));
    }

    const transactions = await this.walletTransactionRepository.find({
      where: {
        ...whereClause,
        status: 'active',
      },
    });

    const chartMap = new Map<string, { earn: number; burn: number }>();

    for (const tx of transactions) {
      const dateKey = tx.created_at
        ? tx.created_at.toISOString().split('T')[0]
        : null; // yyyy-mm-dd
      const current = chartMap.get(dateKey) || { earn: 0, burn: 0 };

      if (tx.type === 'earn' || tx.type === 'adjustment') {
        current.earn += Number(tx.amount);
      } else if (tx.type === 'burn') {
        current.burn += Number(tx.amount);
      }

      chartMap.set(dateKey, current);
    }

    const result = Array.from(chartMap.entries()).map(
      ([date, { earn, burn }]) => ({
        date,
        earned: earn,
        burnt: burn,
      }),
    );

    // Sort by date
    result.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    return result;
    */

    const query = this.walletTransactionRepository
      .createQueryBuilder('tx')
      .select('DATE(tx.created_at)', 'date')
      .addSelect(
        `
    SUM(CASE WHEN tx.type IN ('earn', 'adjustment') THEN tx.point_balance ELSE 0 END)
  `,
        'earned',
      )
      .addSelect(
        `
    SUM(CASE WHEN tx.type = 'burn' THEN tx.point_balance ELSE 0 END)
  `,
        'burnt',
      )
      .where('tx.status = :status', { status: 'active' });

    if (startDate && endDate) {
      query.andWhere('tx.created_at BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      });
    }

    query.groupBy('DATE(tx.created_at)');
    query.orderBy('DATE(tx.created_at)', 'ASC');

    const raw = await query.getRawMany();
    return raw.map((row) => ({
      date: row.date ? row.date.toISOString().split('T')[0] : null,
      earned: Number(row.earned || 0),
      burnt: Number(row.burnt || 0),
    }));
  }

  async getCouponAnalytics(
    client_id,
    permission: any,
    startDate?: string,
    endDate?: string,
  ) {
    if (!permission.canViewAnalytics) {
      throw new BadRequestException(
        "You don't have permission to access analytics",
      );
    }
    const [stats, set, lineData, barData] = await Promise.all([
      this.getCouponCount(startDate, endDate, 'couponSummary', client_id),
      this.getCouponCount(startDate, endDate, 'couponSetSummary', client_id),
      this.getCouponLineData(startDate, endDate),
      this.getCouponBarData(startDate, endDate),
    ]);

    return {
      stats,
      set,
      lineData,
      barData,
    };
  }

  async getCouponCount(startDate, endDate, type, client_id) {
    const { total } = await this.couponRepository
      .createQueryBuilder('coupon')
      .select('COUNT(*)', 'total')
      .where('coupon.status = :status', { status: 1 })
      .andWhere('coupon.tenant_id = :tenantId', { tenantId: client_id })
      .getRawOne();

    /* 
    const couponsUsage = this.walletTransactionRepository
      .createQueryBuilder('tx')
      .select('COUNT(DISTINCT tx.source_id)', 'totalCouponsUsage')
      .where('tx.source_type = :sourceType', { sourceType: 'coupon' });

    if (startDate && endDate) {
      couponsUsage.andWhere('tx.created_at BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      });
    }
    const { totalCouponsUsage } = await couponsUsage.getRawOne();
    */

    // 🟦 Used Coupons
    const usedCouponQuery = this.couponUsageRepo
      .createQueryBuilder('couponUsage')
      .select('COUNT(*)', 'totalCouponsUsage');
    if (startDate && endDate) {
      usedCouponQuery.andWhere('couponUsage.used_at BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      });
    }
    const { totalCouponsUsage } = await usedCouponQuery.getRawOne();

    if (type === 'couponSummary') {
      return [
        { label: 'Coupons', count: Number(total) },
        { label: 'Coupons Usage', count: Number(totalCouponsUsage) },
      ];
    }

    // 🟩 Issued (Issued) Coupons
    const issuedCouponsQuery = this.userCouponRepository
      .createQueryBuilder('user_coupon')
      .select('COUNT(*)', 'totalIssued')
      .where('user_coupon.status = :assigned', { assigned: 'issued' });

    if (startDate && endDate) {
      issuedCouponsQuery.andWhere(
        'user_coupon.created_at BETWEEN :start AND :end',
        {
          start: startDate,
          end: endDate,
        },
      );
    }
    const { totalIssued } = await issuedCouponsQuery.getRawOne();

    const availableCoupons = Number(total) - Number(totalCouponsUsage);
    return [
      { label: 'Total Coupons', count: Number(total) },
      { label: 'Assigned Coupons', count: Number(totalIssued) },
      { label: 'Available Coupons', count: Number(availableCoupons) },
      { label: 'Coupons Usage', count: Number(totalCouponsUsage) },
    ];
  }

  async getCouponLineData(startDate, endDate) {
    /*
    const usageData = this.walletTransactionRepository
      .createQueryBuilder('tx')
      .select("DATE_FORMAT(tx.created_at, '%Y-%m-%d')", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('tx.source_type = :sourceType', { sourceType: 'coupon' });

    if (startDate && endDate) {
      usageData.andWhere('tx.created_at BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      });
    }
    usageData.groupBy("DATE_FORMAT(tx.created_at, '%Y-%m-%d')");
    const data = await usageData.getRawMany();
    */

    const usedCouponQuery = this.couponUsageRepo
      .createQueryBuilder('couponUsage')
      .select("DATE_FORMAT(couponUsage.used_at, '%Y-%m-%d')", 'date')
      .addSelect('COUNT(*)', 'count');

    if (startDate && endDate) {
      usedCouponQuery.andWhere('couponUsage.used_at BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      });
    }
    usedCouponQuery.groupBy("DATE_FORMAT(couponUsage.used_at, '%Y-%m-%d')");
    const data = await usedCouponQuery.getRawMany();

    return data.map((item) => ({
      date: `${item.date}`,
      count: parseInt(item.count, 10),
    }));
  }

  async getCouponBarData(startDate, endDate) {
    /*
    const qb = this.walletTransactionRepository
      .createQueryBuilder('tx')
      .innerJoin('coupons', 'c', 'tx.source_id = c.id')
      .leftJoin('locale_coupon', 'cl', 'cl.coupon_id = c.id')
      .leftJoinAndSelect('cl.language', 'language')
      .select('cl.title', 'couponName')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(tx.amount)', 'totalAmount')
      .where('tx.source_type = :sourceType', { sourceType: 'coupon' })
      .andWhere('language.code = :language_code', { language_code });

    if (startDate && endDate) {
      qb.andWhere('tx.created_at BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      });
    }

    qb.groupBy('cl.title');

    const usageData = await qb.getRawMany();

    const barData = usageData.map((item) => ({
      name: `${item.couponName} (totalAmount = ${item.totalAmount})`,
      count: parseInt(item.count, 10),
    }));

    return barData;
    */

    const issuedCouponQuery = this.userCouponRepository
      .createQueryBuilder('uc')
      .select("DATE_FORMAT(uc.created_at, '%Y-%m-%d')", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('uc.status = :status', { status: 'issued' });

    if (startDate && endDate) {
      issuedCouponQuery.andWhere('uc.created_at BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      });
    }
    issuedCouponQuery.groupBy("DATE_FORMAT(uc.created_at, '%Y-%m-%d')");
    const data = await issuedCouponQuery.getRawMany();

    return data.map((item) => ({
      name: `${item.date}`,
      count: parseInt(item.count, 10),
    }));
  }
}
