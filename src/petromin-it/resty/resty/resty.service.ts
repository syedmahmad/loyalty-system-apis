import { Injectable } from '@nestjs/common';
@Injectable()
export class RestyService {
  constructor() {}

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
      const vehicles = Array.isArray(cust?.vehicles) ? cust.vehicles : [];
      totalVehicles += vehicles.length;
      for (const veh of vehicles) {
        const jobcards = Array.isArray(veh?.jobcards) ? veh.jobcards : [];
        totalJobcards += jobcards.length;
        for (const jc of jobcards) {
          const inv = jc?.jobcard_invoices;
          if (inv) {
            totalInvoices += 1;
            const items = Array.isArray(inv?.jobcard_invoice_items)
              ? inv.jobcard_invoice_items
              : [];
            const freeTotals = items.reduce((acc: number, it: any) => {
              const free = Array.isArray(it?.FreeItems) ? it.FreeItems : [];
              return acc + free.length;
            }, 0);
            totalInvoiceItems += items.length + freeTotals;
            latestTs = maxTs(latestTs, toDateStr(inv?.updated_at));
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
}
