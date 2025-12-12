import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { WalletTransaction } from 'src/wallet/entities/wallet-transaction.entity';
import { WalletOrder } from 'src/wallet/entities/wallet-order.entity';
import { Between, IsNull, Not, Repository } from 'typeorm';
import { Coupon } from 'src/coupons/entities/coupon.entity';
import { UserCoupon } from 'src/wallet/entities/user-coupon.entity';

@Injectable()
export class LoyaltyAnalyticsService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,

    @InjectRepository(WalletTransaction)
    private readonly walletTransactionRepository: Repository<WalletTransaction>,

    @InjectRepository(WalletOrder)
    private readonly walletOrderRepository: Repository<WalletOrder>,

    @InjectRepository(Coupon)
    private readonly couponRepository: Repository<Coupon>,

    @InjectRepository(UserCoupon)
    private userCouponRepository: Repository<UserCoupon>,
  ) {}

  async pointsSplit(permission: any, startDate?: string, endDate?: string) {
    console.log(
      '/////////////////////Loading pointsSplit/////////////////////',
    );
    if (!permission.canViewAnalytics) {
      throw new BadRequestException(
        "You don't have permission to access analytics",
      );
    }
    // Fetch each analytic serially to prevent Out Of Memory (OOM) errors.
    // Note: This mitigates memory spikes, but may increase response time since metrics are not loaded in parallel.
    console.log('/////////////////////Loaded pointsSplit/////////////////////');
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
      .addSelect('SUM(tx.amount)', 'totalPoints')
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
    const [earned, burnt, remaining] = await Promise.all([
      this.walletTransactionRepository
        .createQueryBuilder('tx')
        .select('SUM(tx.amount)', 'total')
        .where('tx.type IN (:...types)', { types: ['earn', 'adjustment'] })
        .andWhere('tx.status = :status', { status: 'active' })
        .andWhere(
          startDate && endDate
            ? 'tx.created_at BETWEEN :start AND :end'
            : '1=1',
          {
            start: startDate,
            end: endDate,
          },
        )
        .getRawOne(),

      this.walletTransactionRepository
        .createQueryBuilder('tx')
        .select('SUM(tx.amount)', 'total')
        .where('tx.type = :type', { type: 'burn' })
        .andWhere('tx.status = :status', { status: 'active' })
        .andWhere(
          startDate && endDate
            ? 'tx.created_at BETWEEN :start AND :end'
            : '1=1',
          {
            start: startDate,
            end: endDate,
          },
        )
        .getRawOne(),

      this.walletRepository
        .createQueryBuilder('wallet')
        .select('SUM(wallet.available_balance)', 'total')
        .getRawOne(),
    ]);

    return {
      totalEarnedPoints: parseFloat(earned.total || 0),
      totalBurntPoints: parseFloat(burnt.total || 0),
      totalLoyaltyPoints:
        parseFloat(earned.total || 0) - parseFloat(burnt.total || 0),
      totalRemainingPoints: parseFloat(remaining.total || 0),
    };
  }

  private async getItemUsage(startDate?: string, endDate?: string) {
    const where: any = {
      items: Not(IsNull()),
    };

    if (startDate && endDate) {
      where.order_date = Between(new Date(startDate), new Date(endDate));
    }

    const orders = await this.walletOrderRepository.find({ where });

    const itemMap = new Map<string, number>();
    for (const order of orders) {
      const items = Array.isArray(order.items)
        ? order.items
        : JSON.parse(order.items || '[]');
      const seen = new Set();

      for (const item of items) {
        if (item?.name && !seen.has(item.name)) {
          seen.add(item.name);
          itemMap.set(item.name, (itemMap.get(item.name) || 0) + 1);
        }
      }
    }

    const totalOrders = orders.length;

    return Array.from(itemMap.entries()).map(([itemName, count]) => ({
      itemName,
      invoiceCount: count,
      percentage: totalOrders
        ? `${((count / totalOrders) * 100).toFixed(2)}%`
        : '0.00%',
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
    SUM(CASE WHEN tx.type IN ('earn', 'adjustment') THEN tx.amount ELSE 0 END)
  `,
        'earned',
      )
      .addSelect(
        `
    SUM(CASE WHEN tx.type = 'burn' THEN tx.amount ELSE 0 END)
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
    const userCouponQuery = this.userCouponRepository
      .createQueryBuilder('user_coupon')
      .select('COUNT(*)', 'totalCouponsUsage')
      .where('user_coupon.status = :status', { status: 'used' });
    if (startDate && endDate) {
      userCouponQuery.andWhere(
        'user_coupon.created_at BETWEEN :start AND :end',
        {
          start: startDate,
          end: endDate,
        },
      );
    }
    const { totalCouponsUsage } = await userCouponQuery.getRawOne();

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

    const usedCouponQuery = this.userCouponRepository
      .createQueryBuilder('uc')
      .select("DATE_FORMAT(uc.created_at, '%Y-%m-%d')", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('uc.status = :status', { status: 'used' });

    if (startDate && endDate) {
      usedCouponQuery.andWhere('uc.created_at BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      });
    }
    usedCouponQuery.groupBy("DATE_FORMAT(uc.created_at, '%Y-%m-%d')");
    const data = await usedCouponQuery.getRawMany();

    return data.map((item) => ({
      date: item.date,
      count: parseInt(item.count, 10),
    }));
  }

  async getCouponBarData(startDate, endDate, language_code = 'en') {
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
  }
}
