import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { RestyInvoicesInfo } from '../entities/resty_invoices_info.entity';
import { RestyInvoiceCleanData } from '../entities/resty_invoice_clean.entity';
import { VehicleServiceJob } from '../entities/vehicle_service_job.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Customer } from 'src/customers/entities/customer.entity';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { WalletSettings } from 'src/wallet/entities/wallet-settings.entity';
import { Rule } from 'src/rules/entities/rules.entity';
import { TiersService } from 'src/tiers/tiers/tiers.service';
import { WalletService } from 'src/wallet/wallet/wallet.service';
import * as os from 'os';
import { NotificationService } from 'src/petromin-it/notification/notification/notifications.service';
import { DeviceToken } from 'src/petromin-it/notification/entities/device-token.entity';
import { RestyCronLog, CronStatus } from '../entities/resty-cron-log.entity';
import {
  RestyPointsAssignmentLog,
  PointsAssignmentStatus,
} from '../entities/resty-points-assignment-log.entity';
import { encrypt, decrypt } from 'src/helpers/encryption';
import { v4 as uuidv4 } from 'uuid';
import * as dayjs from 'dayjs';
import {
  WalletTransactionType,
  WalletTransactionStatus,
} from 'src/wallet/entities/wallet-transaction.entity';
import { WalletTransaction } from 'src/wallet/entities/wallet-transaction.entity';

@Injectable()
export class RestyService {
  constructor(
    @InjectRepository(RestyInvoicesInfo)
    private readonly restyIncoicesInfoRepo: Repository<RestyInvoicesInfo>,
    @InjectRepository(RestyInvoiceCleanData)
    private readonly restyInvoiceCleanDataRepo: Repository<RestyInvoiceCleanData>,
    @InjectRepository(VehicleServiceJob)
    private readonly vehicleServiceJobRepo: Repository<VehicleServiceJob>,
    @InjectRepository(RestyInvoicesInfo)
    private readonly restyInvoicesInfo: Repository<RestyInvoicesInfo>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(WalletSettings)
    private settingsRepo: Repository<WalletSettings>,
    @InjectRepository(Rule)
    private readonly rulesRepo: Repository<Rule>,
    @InjectRepository(DeviceToken)
    private readonly deviceTokenRepo: Repository<DeviceToken>,
    @InjectRepository(RestyCronLog)
    private readonly cronLogRepo: Repository<RestyCronLog>,
    @InjectRepository(RestyPointsAssignmentLog)
    private readonly pointsLogRepo: Repository<RestyPointsAssignmentLog>,
    @InjectRepository(WalletTransaction)
    private readonly walletTransactionRepo: Repository<WalletTransaction>,

    private readonly notificationService: NotificationService,
    private readonly tierService: TiersService,
    private readonly walletService: WalletService,
  ) {}

  /**
   * ✅ API 2: Return latest invoice_date stored in system
   */
  async getCustomerPEInvoices(filters: any) {
    // Acceptable filters: customer_mobile, vin, plat_number (any/all, OR logic)
    const { customer_mobile, vin, plate_number } = filters ?? {};

    // Build dynamic OR conditions array
    const orConditions = [];

    if (customer_mobile) {
      orConditions.push({ customer_mobile });
    }
    if (vin) {
      orConditions.push({ vin });
    }
    if (plate_number) {
      orConditions.push({ plate_number });
    }

    let whereClause = undefined;

    if (orConditions.length === 0) {
      // No filter provided, return empty result
      return [];
    } else if (orConditions.length === 1) {
      // One filter, use direct where
      whereClause = orConditions[0];
    } else {
      // Multiple filters, use OR logic
      whereClause = orConditions;
    }

    const invoices = await this.restyInvoiceCleanDataRepo.find({
      where: whereClause,
      order: { invoice_date: 'DESC' },
    });

    return invoices;
  }

  /**
   * Process datamart payload and compute summary totals and latest invoice timestamp
   */
  async processDatamart(payload: any) {
    const customers = Array.isArray(payload?.customers)
      ? payload.customers
      : [];
    const workshops = Array.isArray(payload?.workshops)
      ? payload.workshops
      : [];

    let totalCustomers = 0;
    let totalVehicles = 0;
    let totalJobcards = 0;
    let totalInvoices = 0;
    let totalInvoiceItems = 0;
    let latestTs: string | null = null;

    const toDateStr = (value?: string | null) => {
      if (!value) return null;
      const d = new Date(value);
      if (isNaN(d.getTime())) return null;
      return d.toISOString().slice(0, 19).replace('T', ' ');
    };

    const maxTs = (a: string | null, b: string | null) => {
      if (!a) return b;
      if (!b) return a;
      return a > b ? a : b;
    };

    totalCustomers = customers.length;

    for (const cust of customers) {
      // vehicles(Vehicle)
      const vehicles = Array.isArray(cust?.['vehicles(Vehicle)'])
        ? cust['vehicles(Vehicle)']
        : [];
      totalVehicles += vehicles.length;

      for (const veh of vehicles) {
        // jobcards(WorkOrder)
        const jobcards = Array.isArray(veh?.['jobcards(WorkOrder)'])
          ? veh['jobcards(WorkOrder)']
          : [];
        totalJobcards += jobcards.length;

        for (const jc of jobcards) {
          const inv = jc?.['jobcard_invoices(Invoice)'];
          if (inv) {
            totalInvoices += 1;

            // jobcard_invoice_items(InvoiceService)
            const items = Array.isArray(
              inv?.['jobcard_invoice_items(InvoiceService)'],
            )
              ? inv['jobcard_invoice_items(InvoiceService)']
              : [];

            // count free items inside each InvoiceService
            const freeTotals = items.reduce((acc: number, it: any) => {
              const free = Array.isArray(
                it?.['FreeItems(InvoiceServiceItemFree)'],
              )
                ? it['FreeItems(InvoiceServiceItemFree)']
                : [];
              return acc + free.length;
            }, 0);

            totalInvoiceItems += items.length + freeTotals;

            // use created_at(InvoiceDate) or updated_at(ModifiedOn) if available
            latestTs = maxTs(
              latestTs,
              toDateStr(inv?.['created_at(InvoiceDate)']),
            );
            latestTs = maxTs(
              latestTs,
              toDateStr(inv?.['updated_at(ModifiedOn)']),
            );
          }
        }
      }
    }

    return {
      success: true,
      message: 'Successfully imported data!',
      data: {
        time_stamp: latestTs,
        total_customers: totalCustomers,
        total_vehicles: totalVehicles,
        total_jobcards: totalJobcards,
        total_invoices: totalInvoices,
        total_invoice_items: totalInvoiceItems,
        workshops: workshops.length,
      },
      errors: [],
    };
  }

  /**
   * ✅ API 2: Return latest invoice_date stored in system
   */
  async getLatestTimestamp(): Promise<string | null> {
    const lastInvoice = await this.restyIncoicesInfoRepo.findOne({
      where: {},
      order: { invoice_date: 'DESC' }, // already string, MySQL can sort dates
    });

    // invoice_date is a string like "2025-09-26"
    return lastInvoice?.invoice_date || null;
  }

  async createVehicleServiceJob(payload: {
    phone_number?: string;
    vehicle_platNo?: string;
    delivery_date?: string;
    status?: string;
    workshop_code?: string;
    workshop_name?: string;
    workshop_address?: string;
    workshop_phone?: string;
    odometer_reading?: string;
  }) {
    const record = this.vehicleServiceJobRepo.create({
      phone_number: payload.phone_number ?? null,
      vehicle_platNo: payload.vehicle_platNo ?? null,
      delivery_date: payload.delivery_date ?? null,
      status: payload.status ?? null,
      workshop_code: payload.workshop_code ?? null,
      workshop_name: payload.workshop_name ?? null,
      workshop_address: payload.workshop_address ?? null,
      workshop_phone: payload.workshop_phone ?? null,
      odometer_reading: payload.odometer_reading ?? null,
    });
    return this.vehicleServiceJobRepo.save(record);
  }

  /**
   * Get new invoice rows from vw_pe_masterdata based on last stored invoice date
   */
  async getNewInvoicesAfterLastSync(): Promise<any[]> {
    const lastTimestamp = await this.getLatestTimestamp();

    if (!lastTimestamp) {
      console.log('⚠️ No previous timestamp found — fetching all data');
      return this.restyIncoicesInfoRepo.query(`
      SELECT * FROM vw_pe_masterdata
      ORDER BY STR_TO_DATE(InvoiceDate, '%Y-%m-%d %H:%i:%s') ASC
    `);
    }

    console.log('🔎 Fetching data after:', lastTimestamp);

    const result = await this.restyIncoicesInfoRepo.query(
      `
      SELECT *
      FROM vw_pe_masterdata
      WHERE STR_TO_DATE(InvoiceDate, '%Y-%m-%d %H:%i:%s') > STR_TO_DATE(?, '%Y-%m-%d %H:%i:%s')
      ORDER BY STR_TO_DATE(InvoiceDate, '%Y-%m-%d %H:%i:%s') ASC
    `,
      [lastTimestamp],
    );

    return result;
  }

  formatDateToMySQL(dateString: string): string {
    const date = new Date(dateString);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // months are 0-indexed
    const day = String(date.getDate()).padStart(2, '0');

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  // I have multiple invoices in databse and in each invoice have multiple items, with same invoice of user entries.
  // There could be multiple invoices for each customer and there could be multiple customers data in this array.

  // I am creating a simple dataset with this, which holds single invoice of a particular customer that holds arrays
  // of its items, so if there are 5 rows in database of same customer invoice with 5 items, its creates and give me
  // single invoice entry that contians 5 items array inside particular customer invoice, and these could be many
  // invoices of many cusotmers as I gave you data form database which will be today’s data and in this data,
  // there could be multiple customers invoices with multiple items.Final array could be like that but you can
  // give me better optimise json if you want.

  // @Cron(CronExpression.EVERY_MINUTE)
  //   ┌──────── minute (0 - 59)
  // │ ┌────── hour (0 - 23)
  // │ │ ┌──── day of month
  // │ │ │ ┌── month
  // │ │ │ │ ┌─ day of week
  // │ │ │ │ │
  // 30  2   *   *   *
  @Cron('00 2 * * *', { timeZone: 'UTC' })
  async processLatestInvoices() {
    const hostName = os.hostname();
    const localUrl = 'http://localhost:3000';
    if (
      process.env.PROD_SERVER_HOST_NAME === hostName ||
      process.env.DEV_SERVER_HOST_NAME === hostName ||
      process.env.UAT_SERVER_HOST_NAME === hostName ||
      process.env.LOCAL_SERVER_HOST_NAME === localUrl
    ) {
      const startTime = new Date();
      console.log(
        '🚀 processLatestInvoices STARTED at:',
        startTime.toISOString(),
      );

      // Create initial log entry
      const cronLog = this.cronLogRepo.create({
        status: CronStatus.STARTED,
        started_at: startTime,
      });
      const savedLog = await this.cronLogRepo.save(cronLog);

      try {
        // 🔹 Step 1: Fetch only new data
        const invoices = await this.getNewInvoicesAfterLastSync();

        if (!invoices || invoices.length === 0) {
          console.log('✅ No new invoices found after last sync.');

          // Update log with success status
          savedLog.status = CronStatus.SUCCESS;
          savedLog.completed_at = new Date();
          savedLog.duration_seconds = Math.floor(
            (savedLog.completed_at.getTime() - startTime.getTime()) / 1000,
          );
          savedLog.total_raw_records = 0;
          savedLog.total_unique_invoices = 0;
          await this.cronLogRepo.save(savedLog);

          return;
        }

        // length of raw data that is not clean yet.
        console.log(`🧾 Found ${invoices.length} new records to process.`);
        savedLog.total_raw_records = invoices.length;
        await this.cronLogRepo.save(savedLog);

        // 🔹 Step 2: Group and process
        const invoicesMap = new Map<string, any>();

        /**
         * This will group raw invoice rows into a structure like:
         * [
         *   {
         *     CustomerID: 'D61DFD91-14FC-4067-990C-499AE177BAD4',
         *     CustomerName: 'MOHAMMED SALEEM',
         *     CustomerMobile: '+966561176415',
         *     ...other invoice fields...,
         *     Items: [
         *       {
         *         ItemBeforeTaxAmount: 99,
         *         ItemGroup: 'Oil',
         *         ServiceBeforeTaxAmount: 0,
         *         ServiceItem: 'Filter',
         *         ServiceName: 'Mighty Oil Filter Service',
         *       },
         *       // ...other items for this invoice
         *     ]
         *   },
         *   // ...other invoices
         * ]
         */
        for (const row of invoices) {
          const invoiceKey = row.InvoiceID;

          if (!invoicesMap.has(invoiceKey)) {
            invoicesMap.set(invoiceKey, {
              CustomerID: row.customermaster_id,
              CustomerName: row.CustomerName,
              CustomerMobile: row.Mobile,
              Email: row.Email,
              StatusFlag: row.StatusFlag,
              Nationality: row.Nationality,
              BirthDate: row.BirthDate,
              LocationName: row.LocationName,
              MakeName: row.MakeName,
              ModelName: row.ModelName,
              VehicleYear: row.VehicleYear,
              VehicleTransmissionTypeID: row.VehicleTransmissionTypeID,
              VIN: row.VIN,
              PlateNumber: row.PlateNumber,
              BranchCode: row.BranchCode,
              BranchName: row.BranchName,
              City: row.City,
              InvoiceID: row.InvoiceID,
              InvoiceDate: new Date(row.InvoiceDate).toUTCString(),
              InvoiceNumber: row.InvoiceNumber,
              InvoiceSubTotalAmount: Number(row.InvoiceBeforeTaxAmount || 0),
              InvoiceTotalAmount: Number(row.InvoiceTotalAmount || 0),
              InvoiceTotalDiscountAmount: Number(
                row.InvoiceDiscountAmount || 0,
              ),
              Latitude: row.Latitude ?? '',
              Longitude: row.Longitude ?? '',
              Mileage: row.WorkOrderMileage,
              Items: [],
            });
          }

          invoicesMap.get(invoiceKey).Items.push({
            ItemBeforeTaxAmount: Number(row.ItemBeforeTaxAmount || 0),
            ItemGroup: row.ItemGroup,
            ServiceBeforeTaxAmount: Number(row.ServiceBeforeTaxAmount || 0),
            ServiceItem: row.ItemName,
            ServiceName: row.ServiceName,
          });
        }

        /**
         * We use invoicesMap.values() here because invoicesMap is keyed by InvoiceID to ensure uniqueness:
         * - invoicesMap: Map<string, any> stores each invoice object with its unique InvoiceID as key,
         *   so there is only one entry per invoice, regardless of how many services/items per invoice.
         * - After populating the map, invoicesMap.values() will give an iterator over all unique invoice objects.
         * - Wrapping it with Array.from() gives us a flat array of all invoices, each with their corresponding items array,
         *   ready for further processing or saving.
         */
        const processedInvoices = Array.from(invoicesMap.values());

        console.log(
          `📦 Grouped into ${processedInvoices.length} unique invoices.`,
        );
        // length of unique data that is clean now.
        savedLog.total_unique_invoices = processedInvoices.length;
        await this.cronLogRepo.save(savedLog);

        // 🔹 Step 3: Build invoice entities for bulk insertion in both tables
        const restyInvoiceCleanDataEntities: RestyInvoiceCleanData[] = [];
        const restyInvoiceInfoEntities: RestyInvoicesInfo[] = [];

        for (const singleInvoice of processedInvoices) {
          const alreadyExistsInvoiceInfo =
            await this.restyIncoicesInfoRepo.findOne({
              where: { invoice_no: singleInvoice.InvoiceNumber },
            });

          // Create entity for resty_invoices_raw_data (detailed data with line items)
          const invoiceDetailEntity = this.restyInvoiceCleanDataRepo.create({
            customer_id: singleInvoice.CustomerID,
            customer_name: singleInvoice.CustomerName,
            customer_mobile: singleInvoice.CustomerMobile,
            email: singleInvoice.Email,
            status_flag: singleInvoice.StatusFlag,
            nationality: singleInvoice.Nationality,
            birth_date: singleInvoice.BirthDate,
            location_name: singleInvoice.LocationName,
            make_name: singleInvoice.MakeName,
            model_name: singleInvoice.ModelName,
            vehicle_year: singleInvoice.VehicleYear,
            vehicle_transmission_type_id:
              singleInvoice.VehicleTransmissionTypeID,
            vin: singleInvoice.VIN,
            plate_number: singleInvoice.PlateNumber,
            branch_code: singleInvoice.BranchCode,
            branch_name: singleInvoice.BranchName,
            city: singleInvoice.City,
            invoice_id: singleInvoice.InvoiceID,
            invoice_date: this.formatDateToMySQL(singleInvoice.InvoiceDate),
            invoice_number: singleInvoice.InvoiceNumber,
            invoice_sub_total_amount: Number(
              singleInvoice.InvoiceSubTotalAmount,
            ),
            invoice_total_amount: Number(singleInvoice.InvoiceTotalAmount),
            invoice_total_discount_amount: Number(
              singleInvoice.InvoiceTotalDiscountAmount,
            ),
            latitude: singleInvoice.Latitude,
            longitude: singleInvoice.Longitude,
            mileage: singleInvoice.Mileage,
            line_items: singleInvoice.Items, // Save items as JSON
          });

          restyInvoiceCleanDataEntities.push(invoiceDetailEntity);

          // Create entity for resty_invoices_info (basic invoice info)
          if (!alreadyExistsInvoiceInfo) {
            const invoiceInfoEntity = this.restyIncoicesInfoRepo.create({
              customer_id: singleInvoice.CustomerID,
              customer_name: singleInvoice.CustomerName,
              customer_email: singleInvoice.Email,
              phone: singleInvoice.CustomerMobile,
              invoice_no: singleInvoice.InvoiceNumber,
              invoice_id: singleInvoice.InvoiceID,
              invoice_amount: Number(singleInvoice.InvoiceTotalAmount),
              invoice_date: this.formatDateToMySQL(singleInvoice.InvoiceDate),
              vehicle_plate_number: singleInvoice.PlateNumber,
              vehicle_vin: singleInvoice.VIN,
              is_claimed: false,
              claimed_points: 0,
              should_assign_points_after_migration: true,
            });

            restyInvoiceInfoEntities.push(invoiceInfoEntity);
          }
        }

        // 🔹 Step 4: Bulk insert all invoices into both tables
        if (restyInvoiceCleanDataEntities.length > 0) {
          await this.restyInvoiceCleanDataRepo.save(
            restyInvoiceCleanDataEntities,
          );
          console.log(
            `✅ Bulk inserted ${restyInvoiceCleanDataEntities.length} records into resty_invoice_clean with line items.`,
          );
        }

        if (restyInvoiceInfoEntities.length > 0) {
          await this.restyIncoicesInfoRepo.save(restyInvoiceInfoEntities);
          console.log(
            `✅ Bulk inserted ${restyInvoiceInfoEntities.length} records into resty_invoices_info.`,
          );
        }

        // Update log with invoice sync completion (but DON'T mark as complete yet)
        savedLog.total_unique_invoices = processedInvoices.length;
        savedLog.processed_invoices = restyInvoiceCleanDataEntities.length;
        await this.cronLogRepo.save(savedLog);

        // 🔹 Step 5: Mark invoice sync as complete
        const finalEndTime = new Date();
        savedLog.status = CronStatus.SUCCESS;
        savedLog.completed_at = finalEndTime;
        savedLog.duration_seconds = Math.floor(
          (finalEndTime.getTime() - startTime.getTime()) / 1000,
        );
        await this.cronLogRepo.save(savedLog);

        console.log('✅ INVOICE SYNC COMPLETED SUCCESSFULLY');
        console.log('📊 Invoice Sync Stats:', {
          totalRecords: savedLog.total_raw_records,
          uniqueInvoices: savedLog.total_unique_invoices,
          processedInvoices: savedLog.processed_invoices,
          duration: `${savedLog.duration_seconds}s`,
        });
      } catch (error) {
        console.error('❌ CRON FAILED WITH ERROR:', error);

        savedLog.status = CronStatus.FAILED;
        savedLog.error_message = error.message || 'Unknown error';
        savedLog.error_details = {
          name: error.name,
          stack: error.stack,
        };

        await this.cronLogRepo.save(savedLog);

        throw error; // Re-throw to let NestJS scheduler handle it
      }
    }
  }

  /**
   * 🔹 CRON 2: Process unclaimed invoices and assign points
   * This is a separate cron that runs independently from invoice sync
   * Schedule: Runs every 5 minutes to process unclaimed invoices
   */
  // @Cron('*/5 * * * *', { timeZone: 'UTC' })
  @Cron(CronExpression.EVERY_10_MINUTES)
  async processUnclaimedInvoicesAndAssignPoints() {
    const hostName = os.hostname();
    const localUrl = 'http://localhost:3000';

    if (
      process.env.PROD_SERVER_HOST_NAME !== hostName &&
      process.env.DEV_SERVER_HOST_NAME !== hostName &&
      process.env.UAT_SERVER_HOST_NAME !== hostName &&
      process.env.LOCAL_SERVER_HOST_NAME !== localUrl
    ) {
      return;
    }

    /** 🔒 CRON LOCK */
    await this.pointsLogRepo.findOne({
      where: { status: PointsAssignmentStatus.STARTED },
    });

    // Previous points assignment run was interrupted, mark it as partial success
    const runningCron = await this.pointsLogRepo.findOne({
      where: { status: PointsAssignmentStatus.STARTED },
    });
    if (runningCron) {
      runningCron.status = PointsAssignmentStatus.PARTIAL_SUCCESS;
      runningCron.error_message =
        'Previous points assignment run was interrupted.';
      runningCron.completed_at = new Date();
      runningCron.duration_seconds = Math.floor(
        (runningCron.completed_at.getTime() -
          runningCron.started_at.getTime()) /
          1000,
      );
      // Update stats before saving
      await this.pointsLogRepo.save(runningCron);
    }

    const startTime = new Date();
    console.log(
      '🚀 processUnclaimedInvoicesAndAssignPoints STARTED at:',
      startTime.toISOString(),
    );

    /** 📊 SAFE STATS */
    const stats = {
      newCustomers: 0,
      existingCustomers: 0,
      transactionsCreated: 0,
      notificationsSent: 0,
      notificationsFailed: 0,
      skippedInvoices: 0,
      failedInvoices: [] as string[],
    };

    let savedLog: RestyPointsAssignmentLog;

    try {
      console.log('🔎 Fetching unclaimed invoices...');

      const unclaimedInvoices = await this.restyIncoicesInfoRepo.find({
        where: {
          is_claimed: false,
          should_assign_points_after_migration: true,
          already_processed_invoice: false,
        },
        take: 5000,
        order: { created_at: 'ASC' }, // Process oldest first (FIFO)
      });

      if (!unclaimedInvoices.length) {
        console.log('✅ No unclaimed invoices found.');
        return;
      }

      const savedLog = await this.pointsLogRepo.save(
        this.pointsLogRepo.create({
          status: PointsAssignmentStatus.STARTED,
          started_at: startTime,
        }),
      );

      savedLog.total_unclaimed_invoices = unclaimedInvoices.length;
      await this.pointsLogRepo.save(savedLog);

      console.log(
        `📦 Processing ${unclaimedInvoices.length} invoices sequentially...`,
      );

      const settings = await this.settingsRepo.findOne({
        where: { business_unit: { id: Number(process.env.NCMC_PETROMIN_BU) } },
      });

      // 🔹 Step 3: Calculate points based on earning rules
      const businessUnitId = Number(process.env.NCMC_PETROMIN_BU);
      const earningRule = await this.rulesRepo.findOne({
        where: {
          business_unit: { id: businessUnitId },
          rule_type: 'spend and earn',
          reward_condition: 'perAmount',
        },
        relations: ['tiers'],
      });

      if (!earningRule) {
        console.log(
          `ℹ️ No earning rule found for business unit ${businessUnitId}`,
        );
        savedLog.skipped_invoices += unclaimedInvoices.length;
        savedLog.status = PointsAssignmentStatus.FAILED;
        savedLog.error_message = `No earning rule found for business unit ${businessUnitId}`;
        savedLog.completed_at = new Date();
        savedLog.duration_seconds = Math.floor(
          (savedLog.completed_at.getTime() - startTime.getTime()) / 1000,
        );
        savedLog.skipped_invoices = stats.skippedInvoices;
        await this.pointsLogRepo.save(savedLog);

        return;
      }

      // 🔹 OPTIMIZATION: Fetch all customers in one query
      console.log('🔍 Pre-fetching all customers with wallets...');

      // Extract unique phone numbers from all invoices:
      // 1. Map all invoices to get phone numbers
      // 2. Filter out null/undefined/empty values
      // 3. Use Set to eliminate duplicates
      // 4. Spread Set back into array
      const uniquePhones = [
        ...new Set(unclaimedInvoices.map((inv) => inv.phone).filter(Boolean)),
      ];

      savedLog.unique_phone_numbers_count = uniquePhones.length;
      await this.pointsLogRepo.save(savedLog);

      const hashedPhones = uniquePhones.map((phone) => encrypt(phone));

      // Fetch all customers with these hashed phone numbers, there are chances that some customer not exist
      // CHANGE: Only fetch active app users (status=1). Previously also fetched non-app users (status=2).
      // Non-app users should no longer receive points — only active app users qualify.
      const existingCustomers = await this.customerRepo.find({
        where: {
          hashed_number: In(hashedPhones),
          status: 1, // Only active app users
          // status: In([1, 2]), // Previously included non-app users (status=2)
        },
        order: {
          id: 'DESC', // or created_at: 'DESC'
        },
        relations: ['tenant', 'business_unit', 'wallet'],
      });

      // creating customer based on the hashed phone number map for quick lookup
      // maintaining a list of customer based on there phone number hashes
      const customerMap = new Map<string, Customer>();
      existingCustomers.forEach((c) => customerMap.set(c.hashed_number, c));
      console.log(`✅ Found ${existingCustomers.length} existing customers`);

      // 🔹 Identify and bulk create new customers, new customers will contain array of plain phone numbers
      const newCustomerPhones = new Set<string>();
      for (const invoice of unclaimedInvoices) {
        if (!invoice.phone) continue;
        const hashedPhone = encrypt(invoice.phone);
        if (!customerMap.has(hashedPhone)) {
          newCustomerPhones.add(invoice.phone);
        }
      }

      // CHANGE: Non-app users (customers not in our loyalty app) no longer get points.
      // We previously created customers with status=2 here so that points could be assigned
      // to them before they joined the app (and they'd see those points once they signed up).
      // This behaviour is now disabled — only active app users (status=1) receive points.
      // The block below is commented out so it can be re-enabled in the future if needed.
      //
      // if (newCustomerPhones.size > 0) {
      //   console.log(`👥 Creating ${newCustomerPhones.size} new customers...`);
      //   const tenantId = parseInt(process.env.NCMC_PETROMIN_TENANT!, 10);
      //
      //   const newCustomersToCreate = Array.from(newCustomerPhones).map(
      //     (phone) => {
      //       const invoice = unclaimedInvoices.find(
      //         (inv) => inv.phone === phone,
      //       );
      //       return this.customerRepo.create({
      //         tenant: { id: tenantId },
      //         business_unit: { id: businessUnitId },
      //         hashed_number: encrypt(phone),
      //         name: invoice?.customer_name || 'Customer',
      //         email: invoice?.customer_email || null,
      //         country_code: '+966',
      //         phone: phone.replace(/^\+?966/, ''),
      //         uuid: uuidv4(),
      //         status: 2, // Non-app user placeholder
      //       });
      //     },
      //   );
      //
      //   // bulk insertion of new customers
      //   const savedCustomers =
      //     await this.customerRepo.save(newCustomersToCreate);
      //
      //   // Create wallets for new customers
      //   for (const customer of savedCustomers) {
      //     await this.walletService.createWallet({
      //       customer_id: customer.id,
      //       business_unit_id: businessUnitId,
      //       tenant_id: tenantId,
      //     });
      //   }
      //
      //   stats.newCustomers += savedCustomers.length;
      //   stats.existingCustomers += customerMap.size;
      //   savedLog.new_customers_created = stats.newCustomers;
      //   savedLog.existing_customers = customerMap.size;
      //   await this.pointsLogRepo.save(savedLog);
      //   console.log(`✅ Created ${savedCustomers.length} new customers`);
      // }

      // Log stats: no new customers are created anymore, only active app users are counted
      stats.existingCustomers = customerMap.size; // active app users found for these invoices
      stats.newCustomers = 0; // always 0 — non-app user creation is disabled
      savedLog.existing_customers = stats.existingCustomers;
      savedLog.new_customers_created = stats.newCustomers;
      await this.pointsLogRepo.save(savedLog);

      if (newCustomerPhones.size > 0) {
        console.log(
          `ℹ️ ${newCustomerPhones.size} phone(s) not found as active app users — skipping (non-app users no longer receive points).`,
        );
      }

      // Reload customers with wallet relations
      // CHANGE: Only reload active app users (status=1). Previously also included status=2.
      const reloadedCustomers = await this.customerRepo.find({
        where: {
          hashed_number: In(hashedPhones),
          status: 1, // Only active app users
          // status: In([1, 2]), // Previously included non-app users (status=2)
        },
        order: {
          id: 'DESC', // or created_at: 'DESC'
        },
        relations: ['tenant', 'business_unit', 'wallet'],
      });

      /** ✅ SEQUENTIAL SAFE LOOP */
      let processedCount = 0;

      for (const invoice of unclaimedInvoices) {
        try {
          await this.processInvoiceForPoints(
            invoice,
            stats,
            settings,
            earningRule,
            reloadedCustomers,
            savedLog,
          );
        } catch (err) {
          console.log(`❌ Invoice ${invoice.invoice_no} failed:`, err.message);
          // we've already logged inside processInvoiceForPoints, that's why we don't do it again here
          // stats.failedInvoices.push(invoice.invoice_no);
        }

        processedCount++;

        /** ❤️ HEARTBEAT LOG */
        if (processedCount % 50 === 0) {
          console.log(
            `⏳ Progress: ${processedCount}/${unclaimedInvoices.length}`,
          );
        }
      }

      /** ✅ FINALIZE LOG */
      const endTime = new Date();
      savedLog.status = PointsAssignmentStatus.SUCCESS;
      savedLog.completed_at = endTime;
      savedLog.duration_seconds = Math.floor(
        (endTime.getTime() - startTime.getTime()) / 1000,
      );

      savedLog.processed_invoices =
        unclaimedInvoices.length -
        stats.failedInvoices.length -
        stats.skippedInvoices;

      savedLog.failed_invoices = stats.failedInvoices.length;
      savedLog.skipped_invoices = stats.skippedInvoices;
      savedLog.new_customers_created = stats.newCustomers;
      savedLog.existing_customers = stats.existingCustomers;
      savedLog.transactions_created = stats.transactionsCreated;
      savedLog.notifications_sent = stats.notificationsSent;
      savedLog.notifications_failed = stats.notificationsFailed;
      savedLog.failed_invoice_ids = stats.failedInvoices.length
        ? stats.failedInvoices
        : null;

      await this.pointsLogRepo.save(savedLog);

      console.log('✅ POINTS ASSIGNMENT COMPLETED SUCCESSFULLY');
      console.log('📊 Final Stats:', {
        totalInvoices: unclaimedInvoices.length,
        processed: savedLog.processed_invoices,
        failed: stats.failedInvoices.length,
        skipped: stats.skippedInvoices,
        duration: `${savedLog.duration_seconds}s`,
      });
    } catch (error) {
      console.error('❌ POINTS ASSIGNMENT CRON FAILED:', error);

      savedLog.status = PointsAssignmentStatus.FAILED;
      savedLog.error_message = error.message;
      savedLog.error_details = {
        name: error.name,
        stack: error.stack,
      };
      savedLog.completed_at = new Date();
      savedLog.duration_seconds = Math.floor(
        (savedLog.completed_at.getTime() - startTime.getTime()) / 1000,
      );

      await this.pointsLogRepo.save(savedLog);
    }
  }

  /**
   * 🔧 Helper method: Process a single invoice and assign points
   *
   * This method handles the complete lifecycle of points assignment for one invoice:
   * 1. Get customer from pre-fetched map
   * 2. Calculate points based on earning rules and tier multipliers
   * 3. Add wallet transaction
   * 4. Send notification
   * 5. Update invoice as claimed
   * 6. Update points assignment log with transaction details
   *
   * @param invoice - The invoice entity to process
   * @param stats - Statistics object to track overall progress
   * @param settings - Wallet settings for expiration calculation
   * @param earningRule - Earning rule for points calculation
   * @param customerMap - Pre-fetched customer lookup map
   * @param savedLog - Points assignment log entry to update
   */
  private async processInvoiceForPoints(
    invoice: RestyInvoicesInfo,
    stats: {
      newCustomers: number;
      existingCustomers: number;
      transactionsCreated: number;
      notificationsSent: number;
      notificationsFailed: number;
      failedInvoices: string[];
      skippedInvoices: number;
    },
    settings: WalletSettings | null,
    earningRule: Rule,
    customerMap: Customer[],
    savedLog: RestyPointsAssignmentLog,
  ): Promise<void> {
    try {
      // Validate invoice has required data
      if (!invoice.phone || !invoice.invoice_no) {
        console.log(
          `⚠️ Invoice ${invoice.id} missing phone or invoice_no, skipping...`,
        );
        stats.skippedInvoices++;
        await this.pointsLogRepo.save(savedLog);
        return;
      }

      // 🔹 Check if invoice already processed in wallet_transaction table
      const existingTransaction = await this.walletTransactionRepo.findOne({
        where: { invoice_no: invoice.invoice_no },
      });

      // these already present...
      if (existingTransaction) {
        // console.log(
        //   `⏭️ Invoice ${invoice.invoice_no} already processed in wallet_transaction, skipping...`,
        // );
        stats.skippedInvoices++;
        savedLog.skipped_invoices = stats.skippedInvoices;
        await this.pointsLogRepo.save(savedLog);

        // Mark as claimed to avoid reprocessing
        if (!invoice.is_claimed) {
          invoice.is_claimed = true;
          invoice.claimed_points = existingTransaction.point_balance || 0;
          invoice.already_processed_invoice = true;
          await this.restyIncoicesInfoRepo.save(invoice);
        }

        return;
      }

      // 🔹 Step 1: Get customer from pre-fetched map
      const hashedPhone = encrypt(invoice.phone);
      let customer = customerMap.find((c) => c.hashed_number === hashedPhone);

      const businessUnitId = Number(process.env.NCMC_PETROMIN_BU);
      const tenantId = parseInt(process.env.NCMC_PETROMIN_TENANT!, 10);

      // CHANGE: Skip invoices for non-app users — only active app users (status=1) receive points.
      // Previously, non-app users were created with status=2 and would still be found here.
      // Now, if no customer is found it means the phone does not belong to an active app user.
      if (!customer) {
        console.log(
          `⏭️ Invoice ${invoice.invoice_no} — phone not linked to an active app user, skipping...`,
        );
        stats.skippedInvoices++;
        savedLog.skipped_invoices = stats.skippedInvoices;
        await this.pointsLogRepo.save(savedLog);

        // Mark as already processed so the cron does not keep retrying this invoice
        invoice.already_processed_invoice = true;
        await this.restyIncoicesInfoRepo.save(invoice);
        return;
      }

      if (!customer?.wallet || !customer?.wallet?.id) {
        await this.walletService.createWallet({
          customer_id: customer.id,
          business_unit_id: businessUnitId,
          tenant_id: tenantId,
        });

        customer = await this.customerRepo.findOne({
          where: {
            hashed_number: customer.hashed_number,
            status: 1, // Only active app users
            // status: In([1, 2]), // Previously included non-app users (status=2)
          },
          relations: ['tenant', 'business_unit', 'wallet'],
        });
      }

      // Calculate base points
      const minAmountSpent =
        parseInt(earningRule.min_amount_spent as any) === 0
          ? 1
          : parseInt(earningRule.min_amount_spent as any);
      const multiplier = (invoice.invoice_amount || 0) / minAmountSpent;
      let rewardPoints = multiplier * earningRule.reward_points;

      // Apply tier multiplier if applicable
      const currentCustomerTier = await this.tierService.getCurrentCustomerTier(
        customer.id,
      );
      if (currentCustomerTier?.tier) {
        const matchingRuleTier = earningRule.tiers.find(
          (rt) => rt.tier.id === currentCustomerTier.tier.id,
        );
        if (
          matchingRuleTier?.point_conversion_rate &&
          matchingRuleTier?.point_conversion_rate !== 1
        ) {
          rewardPoints += rewardPoints * matchingRuleTier.point_conversion_rate;
        }
      }

      const finalPoints = Math.round(rewardPoints);

      // 🔹 Step 4: Add wallet transaction
      try {
        const transactionPayload = {
          wallet: { id: customer?.wallet?.id },
          business_unit: { id: Number(process.env.NCMC_PETROMIN_BU) },
          type: WalletTransactionType.EARN,
          status: WalletTransactionStatus.ACTIVE,
          amount: invoice.invoice_amount,
          invoice_id: invoice.invoice_id,
          invoice_no: invoice.invoice_no,
          created_at: dayjs().toDate(),
          point_balance: finalPoints,
          source_type: 'transaction',
          description: `Points earned for invoice ${invoice.invoice_no}`,
          created_by: 0,
          prev_available_points: customer?.wallet.available_balance,
          external_program_type: 'Resty View Cron',
          transaction_reference: `Points earned for transactions performed on service stations`,
          expiry_date: dayjs(invoice.invoice_date)
            .add(Number(settings?.expiration_value ?? 365), 'day')
            .toDate(),
          customer: { id: customer.id },
          uuid: uuidv4(),
        };

        const transaction =
          this.walletTransactionRepo.create(transactionPayload);

        await this.walletTransactionRepo.save(transaction);

        // Update wallet balances
        customer.wallet.total_balance += finalPoints;
        customer.wallet.available_balance += finalPoints;
        customer.wallet.total_earned_points += finalPoints;
        await this.walletRepo.save(customer.wallet);

        stats.transactionsCreated++;

        // Update log with transaction details
        savedLog.transactions_created = stats.transactionsCreated;
        savedLog.processed_invoices =
          stats.transactionsCreated - stats.failedInvoices.length;
        await this.pointsLogRepo.save(savedLog);

        console.log(
          `💰 Transaction created: ${finalPoints} points for invoice ${invoice.invoice_no}`,
        );
      } catch (err) {
        console.log(
          `⚠️ Error adding wallet transaction for invoice ${invoice.invoice_no}:`,
          err.message,
        );
        stats.failedInvoices.push(invoice.invoice_no);
        savedLog.failed_invoices = stats.failedInvoices.length;
        savedLog.failed_invoice_ids = stats.failedInvoices;
        await this.pointsLogRepo.save(savedLog);
        return;
      }

      // 🔹 Step 5: Send notification synchronously
      const deviceTokens = await this.deviceTokenRepo.find({
        where: { customer: { id: customer.id } },
        order: { createdAt: 'DESC' },
      });

      const templateId = process.env.EARNED_POINTS_TEMPLATE_ID;
      const tokensString = deviceTokens.map((t) => t.token).join(',');

      if (tokensString && templateId) {
        const payload = {
          template_id: templateId,
          language_code: 'en',
          business_name: 'PETROMINit',
          to: [
            {
              user_device_token: tokensString,
              customer_mobile: decrypt(customer.hashed_number),
              dynamic_fields: {
                rewardPoints: finalPoints.toString(),
                event: `invoice ${invoice.invoice_no}`,
              },
            },
          ],
        };

        const saveNotificationPayload = {
          title: 'Points Earned',
          body: `Earned ${finalPoints} points against this event: invoice ${invoice.invoice_no}`,
          customer_id: customer.id,
        };

        // Send notification asynchronously (non-blocking, fire and forget)
        try {
          this.notificationService.sendToUser(payload, saveNotificationPayload);
        } catch (notifErr) {
          stats.notificationsFailed++;
          savedLog.notifications_failed = stats.notificationsFailed;
          savedLog.error_message = `Notification failed for invoice ${invoice.invoice_no}: ${notifErr.message}`;
          await this.pointsLogRepo.save(savedLog);
          console.log(
            `⚠️ Notification failed for invoice ${invoice.invoice_no}:`,
            notifErr.message,
          );
        }

        stats.notificationsSent++;
        savedLog.notifications_sent = stats.notificationsSent;
        await this.pointsLogRepo.save(savedLog);
      }

      // 🔹 Step 6: Update invoice as claimed
      invoice.is_claimed = true;
      invoice.claimed_points = finalPoints;
      invoice.claim_id = uuidv4();
      invoice.claim_date = new Date().toISOString();
      await this.restyIncoicesInfoRepo.save(invoice);

      console.log(`✅ Invoice ${invoice.invoice_no} processed successfully.`);
    } catch (error) {
      console.log(
        `❌ Error processing invoice ${invoice.invoice_no}:`,
        error.message,
      );
      stats.failedInvoices.push(invoice.invoice_no);
      savedLog.failed_invoices = stats.failedInvoices.length;
      savedLog.failed_invoice_ids = stats.failedInvoices;
      await this.pointsLogRepo.save(savedLog);
      throw error; // Re-throw to mark as failed in Promise.allSettled
    }
  }
}
