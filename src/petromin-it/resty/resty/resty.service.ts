import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RestyInvoicesInfo } from '../entities/resty_invoices_info.entity';
@Injectable()
export class RestyService {
  constructor(
    @InjectRepository(RestyInvoicesInfo)
    private readonly restyIncoicesInfoRepo: Repository<RestyInvoicesInfo>,
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
}
