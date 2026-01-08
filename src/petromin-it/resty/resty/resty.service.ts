import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RestyInvoicesInfo } from '../entities/resty_invoices_info.entity';
import { VehicleServiceJob } from '../entities/vehicle_service_job.entity';
import { Cron } from '@nestjs/schedule';
import { Customer } from 'src/customers/entities/customer.entity';
import { decrypt, encrypt } from 'src/helpers/encryption';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { Rule } from 'src/rules/entities/rules.entity';
import { TiersService } from 'src/tiers/tiers/tiers.service';
import { WalletService } from 'src/wallet/wallet/wallet.service';
import { v4 as uuidv4 } from 'uuid';
import * as os from 'os';
import {
  WalletTransactionStatus,
  WalletTransactionType,
} from 'src/wallet/entities/wallet-transaction.entity';
import { NotificationService } from 'src/petromin-it/notification/notification/notifications.service';
import * as dayjs from 'dayjs';
import { DeviceToken } from 'src/petromin-it/notification/entities/device-token.entity';
import { RestyCronLog, CronStatus } from '../entities/resty-cron-log.entity';

@Injectable()
export class RestyService {
  constructor(
    @InjectRepository(RestyInvoicesInfo)
    private readonly restyIncoicesInfoRepo: Repository<RestyInvoicesInfo>,
    @InjectRepository(VehicleServiceJob)
    private readonly vehicleServiceJobRepo: Repository<VehicleServiceJob>,
    @InjectRepository(RestyInvoicesInfo)
    private readonly restyInvoicesInfo: Repository<RestyInvoicesInfo>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(Rule)
    private readonly rulesRepo: Repository<Rule>,
    @InjectRepository(DeviceToken)
    private readonly deviceTokenRepo: Repository<DeviceToken>,
    @InjectRepository(RestyCronLog)
    private readonly cronLogRepo: Repository<RestyCronLog>,

    private readonly notificationService: NotificationService,
    private readonly tierService: TiersService,
    private readonly walletService: WalletService,
  ) {}

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

  // @Cron(CronExpression.EVERY_30_MINUTES)
  //   ┌──────── minute (0 - 59)
  // │ ┌────── hour (0 - 23)
  // │ │ ┌──── day of month
  // │ │ │ ┌── month
  // │ │ │ │ ┌─ day of week
  // │ │ │ │ │
  // 30  2   *   *   *
  @Cron('30 2 * * *', { timeZone: 'UTC' })
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

      const stats = {
        newCustomers: 0,
        existingCustomers: 0,
        transactionsCreated: 0,
        notificationsSent: 0,
        notificationsFailed: 0,
        failedInvoices: [] as string[],
      };

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
        savedLog.total_unique_invoices = processedInvoices.length;
        await this.cronLogRepo.save(savedLog);

        // 🔹 Step 3: Build all entities in memory (bulk)
        const invoiceEntities: RestyInvoicesInfo[] = [];

        for (const singleInvoice of processedInvoices) {
          try {
            // ✅ Check if invoice already exists in database
            const existingInvoice = await this.restyIncoicesInfoRepo.findOne({
              where: { invoice_no: singleInvoice.InvoiceNumber },
            });

            if (existingInvoice) {
              console.log(
                `⏭️ Invoice ${singleInvoice.InvoiceNumber} already exists in database, skipping...`,
              );
              continue;
            }

            let customer = await this.customerRepo.findOne({
              where: {
                hashed_number: encrypt(singleInvoice?.CustomerMobile || ''),
              },
              relations: ['tenant', 'business_unit'],
            });

            // creating new customer with status 2. becasue need to give points
            if (!customer) {
              console.log(
                `👤 Creating new customer: ${singleInvoice.CustomerName} (${singleInvoice.CustomerMobile})`,
              );

              const businessUnitId = parseInt(
                process.env.NCMC_PETROMIN_BU!,
                10,
              );
              const tenantId = parseInt(process.env.NCMC_PETROMIN_TENANT!, 10);

              /**
               * ERROR EXPLANATION:
               * TypeORM's `create()` method only accepts properties that exist on the Customer entity.
               * The keys 'tenant', 'business_unit', and especially 'birth_date' are not valid on the Customer object
               * (based on the current Customer entity type, which likely only accepts IDs for relations and does not have 'birth_date').
               *
               * SOLUTION:
               * - Use 'tenant_id' and 'business_unit_id' fields instead of passing relational objects.
               * - Remove 'birth_date' if it does not exist in the Customer entity, or fix the field name/casing to match entity definition.
               *   (Assuming from error that birth_date is invalid/unknown.)
               */
              const newCustomer = this.customerRepo.create({
                tenant: { id: tenantId },
                business_unit: { id: businessUnitId },
                hashed_number: encrypt(singleInvoice.CustomerMobile),
                email: singleInvoice.Email,
                name: singleInvoice.CustomerName,
                country_code: '+966',
                phone: singleInvoice.CustomerMobile?.replace(/^\+?966/, ''),
                DOB: singleInvoice.BirthDate,
                address: singleInvoice.LocationName,
                uuid: uuidv4(),
                status: 2,
              });

              const savedCustomer = await this.customerRepo.save(newCustomer);

              await this.walletService.createWallet({
                customer_id: savedCustomer.id,
                business_unit_id: businessUnitId,
                tenant_id: tenantId,
              });

              customer = savedCustomer;
              stats.newCustomers++;
              console.log(`✅ New customer created with ID: ${customer.id}`);
            } else {
              stats.existingCustomers++;
              console.log(
                `✓ Existing customer found: ${customer.name} (ID: ${customer.id})`,
              );
            }

            let points = 0;

            // 🔹 Calculate reward points if applicable
            const wallet = await this.walletRepo.findOne({
              where: { customer: { id: customer.id } },
            });

            if (!wallet) {
              console.log(
                `⚠️ Wallet not found for customer: ${customer.id} - Invoice: ${singleInvoice.InvoiceNumber}`,
              );
              stats.failedInvoices.push(singleInvoice.InvoiceNumber);
              continue;
            }

            const businessUnitId = customer.business_unit.id;
            const earningRule = await this.rulesRepo.findOne({
              where: {
                business_unit: { id: businessUnitId },
                rule_type: 'spend and earn',
                reward_condition: 'perAmount',
              },
              relations: ['tiers'],
            });

            if (earningRule) {
              const minAmountSpent =
                parseInt(earningRule.min_amount_spent as any) === 0
                  ? 1
                  : parseInt(earningRule.min_amount_spent as any);
              const multiplier =
                singleInvoice.InvoiceTotalAmount / minAmountSpent;
              let rewardPoints = multiplier * earningRule.reward_points;

              const currentCustomerTier =
                await this.tierService.getCurrentCustomerTier(customer.id);
              if (currentCustomerTier?.tier) {
                const matchingRuleTier = earningRule.tiers.find(
                  (rt) => rt.tier.id === currentCustomerTier.tier.id,
                );
                if (
                  matchingRuleTier?.point_conversion_rate &&
                  matchingRuleTier?.point_conversion_rate !== 1
                ) {
                  rewardPoints +=
                    rewardPoints * matchingRuleTier.point_conversion_rate;
                }
              }

              points = rewardPoints;

              // add transaction
              try {
                await this.walletService.addTransaction(
                  {
                    wallet_id: wallet.id,
                    business_unit_id: businessUnitId,
                    type: WalletTransactionType.EARN,
                    status: WalletTransactionStatus.ACTIVE,
                    amount: singleInvoice.InvoiceTotalAmount,
                    invoice_id: singleInvoice.InvoiceNumber,
                    invoice_no: singleInvoice.InvoiceNumber,
                    created_at: dayjs().toDate(),
                    points_balance: points,
                    source_type: 'transaction',
                    description: `Points earned for invoice ${singleInvoice.InvoiceNumber}`,
                    created_by: 0,
                    prev_available_points: wallet.available_balance,
                    external_program_type: 'Resty View Cron',
                    transaction_reference: `Points earned for transactions performed on service stations`,
                  },
                  0,
                  true,
                );
                stats.transactionsCreated++;
                console.log(
                  `💰 Transaction created: ${points} points for invoice ${singleInvoice.InvoiceNumber}`,
                );
              } catch (err) {
                console.log(
                  `⚠️ Error adding wallet transaction for invoice ${singleInvoice.InvoiceNumber}:`,
                  err,
                );
                stats.failedInvoices.push(singleInvoice.InvoiceNumber);
              }

              const deviceTokens = await this.deviceTokenRepo.find({
                where: { customer: { id: customer.id } },
                order: { createdAt: 'DESC' },
              });

              const templateId = process.env.EARNED_POINTS_TEMPLATE_ID;

              const tokensString = deviceTokens.map((t) => t.token).join(',');

              const payload = {
                template_id: templateId,
                language_code: 'en', // or 'ar'
                business_name: 'PETROMINit',
                to: [
                  {
                    user_device_token: tokensString,
                    customer_mobile: decrypt(customer.hashed_number),
                    dynamic_fields: {
                      rewardPoints: rewardPoints.toString(),
                      event: `invoice ${singleInvoice.InvoiceNumber}`,
                    },
                  },
                ],
              };

              const saveNotificationPayload = {
                title: 'Points Earned',
                body: `Earned ${rewardPoints} points against this event: invoice ${singleInvoice.InvoiceNumber}`,
                customer_id: customer.id,
              };

              // Send notification request
              try {
                await this.notificationService.sendToUser(
                  payload,
                  saveNotificationPayload,
                );
                stats.notificationsSent++;
                console.log(
                  `📧 Notification sent for invoice ${singleInvoice.InvoiceNumber}`,
                );
              } catch (notifErr) {
                stats.notificationsFailed++;
                console.log(
                  `⚠️ Notification failed for invoice ${singleInvoice.InvoiceNumber}:`,
                  notifErr,
                );
              }
            } else {
              console.log(
                `ℹ️ No earning rule found for business unit ${businessUnitId} - Invoice: ${singleInvoice.InvoiceNumber}`,
              );
            }

            // ✅ Collect invoice entity (do NOT save yet)
            invoiceEntities.push(
              this.restyIncoicesInfoRepo.create({
                customer_id: singleInvoice.CustomerID,
                phone: singleInvoice.CustomerMobile,
                invoice_no: singleInvoice.InvoiceNumber,
                invoice_id: singleInvoice.InvoiceID,
                invoice_amount: Number(singleInvoice.InvoiceTotalAmount),
                invoice_date: this.formatDateToMySQL(singleInvoice.InvoiceDate),
                vehicle_plate_number: singleInvoice.PlateNumber,
                vehicle_vin: singleInvoice.VIN,
                is_claimed: true,
                claimed_points: Math.round(points),
                claim_id: uuidv4(),
                claim_date: new Date().toISOString(),
                free_items: null,
                sync_log_id: null,
              }),
            );
          } catch (invoiceError) {
            console.log(
              `❌ Error processing invoice ${singleInvoice.InvoiceNumber}:`,
              invoiceError,
            );
            stats.failedInvoices.push(singleInvoice.InvoiceNumber);
          }
        }

        // 🔹 Step 4: Bulk save all invoices in one go
        if (invoiceEntities.length > 0) {
          await this.restyIncoicesInfoRepo.save(invoiceEntities);
          console.log(`✅ Bulk inserted ${invoiceEntities.length} invoices.`);
        } else {
          console.log('✅ No new invoice entities to save.');
        }

        // Get the latest timestamp for next sync
        const latestTimestamp = await this.getLatestTimestamp();

        // Update log with final success status
        const endTime = new Date();
        savedLog.status =
          stats.failedInvoices.length > 0
            ? CronStatus.PARTIAL_SUCCESS
            : CronStatus.SUCCESS;
        savedLog.completed_at = endTime;
        savedLog.duration_seconds = Math.floor(
          (endTime.getTime() - startTime.getTime()) / 1000,
        );
        savedLog.processed_invoices = invoiceEntities.length;
        savedLog.failed_invoices = stats.failedInvoices.length;
        savedLog.new_customers_created = stats.newCustomers;
        savedLog.existing_customers = stats.existingCustomers;
        savedLog.transactions_created = stats.transactionsCreated;
        savedLog.notifications_sent = stats.notificationsSent;
        savedLog.notifications_failed = stats.notificationsFailed;
        savedLog.failed_invoice_ids =
          stats.failedInvoices.length > 0 ? stats.failedInvoices : null;
        savedLog.last_synced_timestamp = latestTimestamp;

        await this.cronLogRepo.save(savedLog);

        console.log('✅ CRON COMPLETED SUCCESSFULLY');
        console.log('📊 Final Stats:', {
          totalRecords: savedLog.total_raw_records,
          uniqueInvoices: savedLog.total_unique_invoices,
          processedInvoices: savedLog.processed_invoices,
          failedInvoices: savedLog.failed_invoices,
          newCustomers: stats.newCustomers,
          existingCustomers: stats.existingCustomers,
          transactionsCreated: stats.transactionsCreated,
          notificationsSent: stats.notificationsSent,
          notificationsFailed: stats.notificationsFailed,
          duration: `${savedLog.duration_seconds}s`,
        });
      } catch (error) {
        console.error('❌ CRON FAILED WITH ERROR:', error);

        // Update log with error status
        const endTime = new Date();
        savedLog.status = CronStatus.FAILED;
        savedLog.completed_at = endTime;
        savedLog.duration_seconds = Math.floor(
          (endTime.getTime() - startTime.getTime()) / 1000,
        );
        savedLog.error_message = error.message || 'Unknown error';
        savedLog.error_details = {
          name: error.name,
          stack: error.stack,
          ...stats,
        };
        savedLog.new_customers_created = stats.newCustomers;
        savedLog.existing_customers = stats.existingCustomers;
        savedLog.transactions_created = stats.transactionsCreated;
        savedLog.notifications_sent = stats.notificationsSent;
        savedLog.notifications_failed = stats.notificationsFailed;
        savedLog.failed_invoice_ids =
          stats.failedInvoices.length > 0 ? stats.failedInvoices : null;

        await this.cronLogRepo.save(savedLog);

        throw error; // Re-throw to let NestJS scheduler handle it
      }
    }
  }
}
