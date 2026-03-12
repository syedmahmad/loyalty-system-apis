import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { WalletTransaction } from 'src/wallet/entities/wallet-transaction.entity';
import { In, Repository } from 'typeorm';
import { Coupon } from 'src/coupons/entities/coupon.entity';
import { UserCoupon } from 'src/wallet/entities/user-coupon.entity';
import { CouponUsage } from 'src/coupons/entities/coupon-usages.entity';
import { RestyInvoicesInfo } from 'src/petromin-it/resty/entities/resty_invoices_info.entity';
import { Rule } from 'src/rules/entities/rules.entity';
import { Customer } from 'src/customers/entities/customer.entity';
import { encrypt } from 'src/helpers/encryption';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';

@Injectable()
export class LoyaltyAnalyticsService {
  constructor(
    @InjectRepository(Wallet, 'slave')
    private readonly walletRepository: Repository<Wallet>,

    @InjectRepository(WalletTransaction, 'slave')
    private readonly walletTransactionRepository: Repository<WalletTransaction>,

    @InjectRepository(Coupon, 'slave')
    private readonly couponRepository: Repository<Coupon>,

    @InjectRepository(UserCoupon, 'slave')
    private userCouponRepository: Repository<UserCoupon>,

    @InjectRepository(CouponUsage, 'slave')
    private couponUsageRepo: Repository<CouponUsage>,

    @InjectRepository(RestyInvoicesInfo, 'slave')
    private readonly restyInvoicesRepository: Repository<RestyInvoicesInfo>,

    @InjectRepository(Rule, 'slave')
    private readonly rulesRepository: Repository<Rule>,

    @InjectRepository(Customer, 'slave')
    private readonly customerRepository: Repository<Customer>,

    @InjectRepository(BusinessUnit)
    private readonly businessUnitRepository: Repository<BusinessUnit>,
  ) {}

  async pointsSplit(permission: any, startDate?: string, endDate?: string) {
    if (!permission.canViewAnalytics) {
      throw new BadRequestException(
        "You don't have permission to access analytics",
      );
    }
    // Fetch each analytic serially to prevent Out Of Memory (OOM) errors.
    // Note: This mitigates memory spikes, but may increase response time since metrics are not loaded in parallel.
    const pointSplits = await this.getPointsSplit(
      permission.tenantId,
      startDate,
      endDate,
    );
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
    const customerByPoints = await this.getCustomerPointDistribution(
      permission.tenantId,
    );
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
    const summary = await this.getPointSummary(
      permission.tenantId,
      startDate,
      endDate,
    );
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
    const itemUsage = await this.getItemUsage(
      permission.tenantId,
      startDate,
      endDate,
    );
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
    const barChart = await this.getBarChartData(
      permission.tenantId,
      startDate,
      endDate,
    );
    return {
      barChart,
    };
  }

  private async getPointsSplit(
    tenantId: number,
    startDate?: string,
    endDate?: string,
  ) {
    const qb = this.walletTransactionRepository
      .createQueryBuilder('tx')
      .select('tx.source_type', 'sourceType')
      .addSelect('SUM(tx.point_balance)', 'totalPoints')
      .where('tx.type IN (:...types)', { types: ['earn', 'adjustment'] })
      .andWhere('tx.status = :status', { status: 'active' })
      .andWhere('tx.tenant = :tenantId', { tenantId });

    if (startDate && endDate) {
      qb.andWhere('tx.created_at BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      });
    }

    return qb.groupBy('tx.source_type').getRawMany();
  }

  private async getCustomerPointDistribution(tenantId: number) {
    const { total } = await this.walletRepository
      .createQueryBuilder('wallet')
      .select('COUNT(*)', 'total')
      .where('wallet.tenant = :tenantId', { tenantId })
      .getRawOne();

    const ranges = await this.walletRepository
      .createQueryBuilder('wallet')
      .select(
        `
        CASE
          WHEN wallet.total_balance BETWEEN 0 AND 1000 THEN '0-1,000'
          WHEN wallet.total_balance BETWEEN 1001 AND 2000 THEN '1,001-2,000'
          WHEN wallet.total_balance BETWEEN 2001 AND 5000 THEN '2,001-5,000'
          ELSE '5,001+'
        END
      `,
        'range',
      )
      .addSelect('COUNT(*)', 'count')
      .where('wallet.tenant = :tenantId', { tenantId })
      .groupBy(
        `
        CASE
          WHEN wallet.total_balance BETWEEN 0 AND 1000 THEN '0-1,000'
          WHEN wallet.total_balance BETWEEN 1001 AND 2000 THEN '1,001-2,000'
          WHEN wallet.total_balance BETWEEN 2001 AND 5000 THEN '2,001-5,000'
          ELSE '5,001+'
        END
      `,
      )
      .getRawMany();

    return ranges.map((r: any) => ({
      ...r,
      percentage: total ? ((r.count / total) * 100).toFixed(2) + '%' : '0%',
    }));
  }

  private async getPointSummary(
    tenantId: number,
    startDate?: string,
    endDate?: string,
  ) {
    const earnQb = this.walletTransactionRepository
      .createQueryBuilder('tx')
      .select('SUM(tx.point_balance)', 'totalEarned')
      .where('tx.type = :type', { type: 'earn' })
      .andWhere('tx.status = :status', { status: 'active' })
      .andWhere('tx.tenant = :tenantId', { tenantId });

    const activeBurnQb = this.walletTransactionRepository
      .createQueryBuilder('tx')
      .select('SUM(tx.point_balance)', 'totalBurnt')
      .where('tx.type = :type', { type: 'burn' })
      .andWhere('tx.status = :status', { status: 'active' })
      .andWhere('tx.tenant = :tenantId', { tenantId });

    const notConfirmedBurnQb = this.walletTransactionRepository
      .createQueryBuilder('tx')
      .select('SUM(tx.point_balance)', 'totalNotConfirmedBurnt')
      .where('tx.type = :type', { type: 'burn' })
      .andWhere('tx.status = :status', { status: 'not_confirmed' })
      .andWhere('tx.tenant = :tenantId', { tenantId });

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
        .where('wallet.tenant = :tenantId', { tenantId })
        .getRawOne(),
      activeBurnQb.getRawOne(),
      notConfirmedBurnQb.getRawOne(),
    ]);

    const totalEarned = parseFloat(earnedResult?.totalEarned || 0);
    const totalRemaining = parseFloat(remainingResult?.totalRemaining || 0);
    const totalBurnt = parseFloat(activeBurnResult?.totalBurnt || 0);
    const totalNotConfirmedBurnt = Math.abs(
      parseFloat(notConfirmedBurnResult?.totalNotConfirmedBurnt || 0),
    );

    return {
      totalEarnedPoints: totalEarned,
      totalBurntPoints: totalBurnt,
      totalNotConfirmedBurntPoints: totalNotConfirmedBurnt,
      totalLoyaltyPoints: totalEarned - totalBurnt,
      totalRemainingPoints: totalRemaining,
    };
  }

  private async getItemUsage(
    tenantId: number,
    startDate?: string,
    endDate?: string,
  ) {
    const qb = this.walletTransactionRepository
      .createQueryBuilder('tx')
      .select('tx.source_type', 'sourceType')
      .addSelect('COUNT(*)', 'transactionCount')
      .addSelect('SUM(tx.point_balance)', 'totalPoints')
      .addSelect('SUM(tx.amount)', 'totalAmount')
      .where('tx.type IN (:...types)', { types: ['earn', 'adjustment'] })
      .andWhere('tx.status = :status', { status: 'active' })
      .andWhere('tx.tenant = :tenantId', { tenantId });

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

  private async getBarChartData(
    tenantId: number,
    startDate?: string,
    endDate?: string,
  ) {
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
      .where('tx.status = :status', { status: 'active' })
      .andWhere('tx.tenant = :tenantId', { tenantId });

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

  async getNonClaimedPoints(
    permission: any,
    startDate?: string,
    endDate?: string,
  ) {
    if (!permission.canViewAnalytics) {
      throw new BadRequestException(
        "You don't have permission to access analytics",
      );
    }
    return this.getUnclaimedPointsSummary(
      permission.tenantId,
      startDate,
      endDate,
    );
  }

  /**
   * Aggregates unclaimed points summary for invoice data (one row per unique phone).
   * Returns the number of unclaimed invoices, total unclaimed amount, estimated points,
   * and points-per-SAR (Saudi Riyal) rate for active customers only.
   *
   * NOTE: this will pick invoices only for active customers, all other invoices amount, not calculate here.
   */
  private async getUnclaimedPointsSummary(
    tenantId: number,
    startDate?: string,
    endDate?: string,
  ) {
    // 1. Get earning rule (same as in getPendingPointsForCustomer in resty.service)
    const businessUnitId = Number(process.env.NCMC_PETROMIN_BU);

    // This data only applies to the NCMC tenant. Return zeros for any other tenant.
    const ncmcBu = await this.businessUnitRepository.findOne({
      where: { id: businessUnitId },
      select: ['tenant_id'],
    });
    if (!ncmcBu || ncmcBu.tenant_id !== tenantId) {
      return {
        unclaimedCount: 0,
        totalAmount: 0,
        estimatedPoints: 0,
        pointsPerSar: 0,
      };
    }
    const earnRule = await this.rulesRepository.findOne({
      where: {
        business_unit: { id: businessUnitId },
        rule_type: 'spend and earn',
        reward_condition: 'perAmount',
      },
    });

    // Earning rule: minimum amount to spend for a reward, and reward points per 'step'
    const minAmountSpent = Number(earnRule?.min_amount_spent) || 1;
    const rewardPoints = earnRule?.reward_points || 0;
    // Compute conversion rate for points earned per SAR spent
    const pointsPerSar = rewardPoints / minAmountSpent;

    // 2. Aggregate RESTY invoices by phone (where points should be assigned, not claimed, and not already processed)
    //    Only include invoices tied to a non-null phone value.
    const qb = this.restyInvoicesRepository
      .createQueryBuilder('inv')
      .select('inv.phone', 'phone')
      .addSelect('COUNT(inv.id)', 'invoiceCount')
      .addSelect('COALESCE(SUM(inv.invoice_amount), 0)', 'totalAmount')
      .where('inv.is_claimed = :claimed', { claimed: false })
      .andWhere('inv.should_assign_points_after_migration = :sap', {
        sap: true,
      })
      .andWhere('inv.already_processed_invoice = :ap', { ap: false })
      .andWhere('inv.phone IS NOT NULL');

    // 3. Optionally filter by creation date, if both range values are provided
    if (startDate && endDate) {
      qb.andWhere('inv.created_at BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      });
    }

    // 4. Get the result as an array of {phone, invoiceCount, totalAmount}
    const phoneRows: {
      phone: string;
      invoiceCount: string;
      totalAmount: string;
    }[] = await qb.groupBy('inv.phone').getRawMany();

    // Return zeroes if there are no matching invoice rows
    if (!phoneRows.length) {
      return {
        unclaimedCount: 0,
        totalAmount: 0,
        estimatedPoints: 0,
        pointsPerSar,
      };
    }

    // 5. Encrypt each unique phone (to match with hashed_number field of customers)
    const phoneToHash = new Map<string, string>();
    for (const row of phoneRows) {
      try {
        phoneToHash.set(row.phone, encrypt(row.phone));
      } catch {
        // skip phones that fail encryption (invalid, etc)
      }
    }

    // 6. Only proceed if there are phones that could be encrypted
    const hashedPhones = [...phoneToHash.values()];
    if (!hashedPhones.length) {
      return {
        unclaimedCount: 0,
        totalAmount: 0,
        estimatedPoints: 0,
        pointsPerSar,
      };
    }

    // 7. Find active customer records (status 1) whose hashed_number matches encrypted phone
    const activeCustomers = await this.customerRepository.find({
      where: { hashed_number: In(hashedPhones), status: 1 },
      select: ['hashed_number'],
    });

    // Store the set of hashes for active customers for fast lookup
    const activeHashSet = new Set(activeCustomers.map((c) => c.hashed_number));

    // 8. For each phone in aggregation, if phone's encrypted hash is an active customer:
    //    - include their invoice count and total amount in stats
    let unclaimedCount = 0;
    let totalAmount = 0;
    for (const row of phoneRows) {
      const hash = phoneToHash.get(row.phone);
      if (hash && activeHashSet.has(hash)) {
        unclaimedCount += Number(row.invoiceCount);
        totalAmount += Number(row.totalAmount || 0);
      }
    }

    // 9. Package summary result
    return {
      unclaimedCount,
      totalAmount: parseFloat(totalAmount.toFixed(2)), // round to two decimals
      estimatedPoints: Math.round(totalAmount * pointsPerSar), // estimate points earned
      pointsPerSar,
    };
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
