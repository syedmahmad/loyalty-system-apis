import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RestyInvoicesInfo } from '../entities/resty_invoices_info.entity';
import { VehicleServiceJob } from '../entities/vehicle_service_job.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Customer } from 'src/customers/entities/customer.entity';
import { encrypt } from 'src/helpers/encryption';
import { VehiclesService } from 'src/vehicles/vehicles/vehicles.service';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { Rule } from 'src/rules/entities/rules.entity';
import { TiersService } from 'src/tiers/tiers/tiers.service';
import { WalletService } from 'src/wallet/wallet/wallet.service';
import { v4 as uuidv4 } from 'uuid';
import {
  WalletTransactionStatus,
  WalletTransactionType,
} from 'src/wallet/entities/wallet-transaction.entity';

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

    private readonly vehicleService: VehiclesService,
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

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async processLatestInvoices() {
    console.log('processLatestInvoices :::');

    // 🔹 Step 1: Fetch only new data
    const invoices = await this.getNewInvoicesAfterLastSync();

    if (!invoices || invoices.length === 0) {
      console.log('✅ No new invoices found after last sync.');
      return;
    }

    console.log(`🧾 Found ${invoices.length} new records to process.`);

    // 🔹 Step 2: Group and process
    const invoicesMap = new Map<string, any>();

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
          InvoiceTotalDiscountAmount: Number(row.InvoiceDiscountAmount || 0),
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

    const processedInvoices = Array.from(invoicesMap.values());

    // 🔹 Step 3: Build all entities in memory (bulk)
    const invoiceEntities: RestyInvoicesInfo[] = [];

    for (const singleInvoice of processedInvoices) {
      let customer = await this.customerRepo.findOne({
        where: { hashed_number: encrypt(singleInvoice.CustomerMobile) },
        relations: ['tenant', 'business_unit'],
      });

      if (!customer) {
        const businessUnitId = parseInt(process.env.NCMC_PETROMIN_BU!, 10);
        const tenantId = parseInt(process.env.NCMC_PETROMIN_TENANT!, 10);

        const newCustomer = this.customerRepo.create({
          tenant: { id: tenantId },
          business_unit: { id: businessUnitId },
          hashed_number: encrypt(singleInvoice.CustomerMobile),
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
      }

      let points = 0;

      // 🔹 Calculate reward points if applicable
      const wallet = await this.walletRepo.findOne({
        where: { customer: { id: customer.id } },
      });

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
        const multiplier = singleInvoice.InvoiceTotalAmount / minAmountSpent;
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
              points_balance: points,
              source_type: 'invoice',
              description: `Points earned for invoice ${singleInvoice.InvoiceNumber}`,
              created_by: 0,
              prev_available_points: wallet.available_balance,
            },
            0,
            true,
          );
        } catch (err) {
          console.log('⚠️ Error adding wallet transaction:', err);
        }
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
          clamined_points: Math.round(points),
          claim_id: uuidv4(),
          claim_date: new Date().toISOString(),
          free_items: null,
          sync_log_id: null,
        }),
      );
    }

    // 🔹 Step 4: Bulk save all invoices in one go
    if (invoiceEntities.length > 0) {
      await this.restyIncoicesInfoRepo.save(invoiceEntities);
      console.log(`✅ Bulk inserted ${invoiceEntities.length} invoices.`);
    } else {
      console.log('✅ No new invoice entities to save.');
    }
  }
}
