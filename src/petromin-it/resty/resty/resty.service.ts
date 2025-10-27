import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RestyInvoicesInfo } from '../entities/resty_invoices_info.entity';
import { VehicleServiceJob } from '../entities/vehicle_service_job.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { restyLatestInvoices } from './invoices.data';

@Injectable()
export class RestyService {
  constructor(
    @InjectRepository(RestyInvoicesInfo)
    private readonly restyIncoicesInfoRepo: Repository<RestyInvoicesInfo>,
    @InjectRepository(VehicleServiceJob)
    private readonly vehicleServiceJobRepo: Repository<VehicleServiceJob>,
    @InjectRepository(RestyInvoicesInfo)
    private readonly restyInvoicesInfo: Repository<RestyInvoicesInfo>,
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

  // I have multiple invoices in databse and in each invoice have multiple items, with same invoice of user entries.
  // There could be multiple invoices for each customer and there could be multiple customers data in this array.

  // I am creating a simple dataset with this, which holds single invoice of a particular customer that holds arrays
  // of its items, so if there are 5 rows in database of same customer invoice with 5 items, its creates and give me
  // single invoice entry that contians 5 items array inside particular customer invoice, and these could be many
  // invoices of many cusotmers as I gave you data form database which will be today’s data and in this data,
  // there could be multiple customers invoices with multiple items.Final array could be like that but you can
  // give me better optimise json if you want.

  // @Cron(CronExpression.EVERY_10_SECONDS)
  async processLatestInvoices() {
    console.log('processLatestInvoices :::');

    const invoices = restyLatestInvoices;
    const total = invoices.length;
    if (total > 0) {
      const invoicesMap = new Map<string, any>();

      for (const row of invoices) {
        const invoiceKey = row.InvoiceID;

        // If this invoice isn't already in our map, add it
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
            InvoiceSubTotalAmount:
              row.InvoiceBeforeTaxAmount?.toFixed(4) ?? '0.0000',
            InvoiceTotalAmount: row.InvoiceTotalAmount?.toFixed(4) ?? '0.0000',
            InvoiceTotalDiscountAmount:
              row.InvoiceDiscountAmount?.toFixed(4) ?? '0.0000',
            Latitude: row.Latitude?.toString() ?? '',
            Longitude: row.Longitude?.toString() ?? '',
            Mileage: row.WorkOrderMileage,
            Items: [],
          });
        }

        // Build item object from this row
        const item = {
          ItemBeforeTaxAmount: row.ItemBeforeTaxAmount?.toFixed(4) ?? '0.0000',
          ItemGroup: row.ItemGroup ?? null,
          ServiceBeforeTaxAmount:
            row.ServiceBeforeTaxAmount?.toFixed(4) ?? '0.0000',
          ServiceItem: row.ItemName ?? null,
          ServiceName: row.ServiceName ?? null,
        };

        // Push item into the corresponding invoice's Items array
        invoicesMap.get(invoiceKey).Items.push(item);
      }

      // Return grouped and formatted invoices
      const processedInvocies = Array.from(invoicesMap.values());

      // Bulk create instead of inserting one by one
      const invoiceEntities = processedInvocies.map((singleInvoice) =>
        this.restyInvoicesInfo.create({
          customer_id: singleInvoice.CustomerID,
          phone: singleInvoice.CustomerMobile,
          invoice_no: singleInvoice.InvoiceNumber,
          invoice_id: singleInvoice.InvoiceID,
          invoice_amount: singleInvoice.InvoiceTotalAmount,
          invoice_date: singleInvoice.InvoiceDate,
          vehicle_plate_number: singleInvoice.PlateNumber,
          vehicle_vin: singleInvoice.VIN,
          vehicle_info: singleInvoice.VehicleInfo,
          // Ensure claim-related fields remain null/empty
          is_claimed: null,
          clamined_points: null,
          claim_id: null,
          claim_date: null,
          free_items: null,
          sync_log_id: null,
        }),
      );

      await this.restyInvoicesInfo.save(invoiceEntities);

      console.dir(processedInvocies, { depth: null });
    }
  }
}
