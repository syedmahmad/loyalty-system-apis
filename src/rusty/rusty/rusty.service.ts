import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RustyUser } from '../entities/rusty-users.entity';
import { RustyWorkshop } from '../entities/rusty-workshops.entity';
import { JobcardsInvoice } from '../entities/rusty-invoices.entity';
import { Vehicle } from '../entities/rusty-vehicles.entity';
import { RustyJobcard } from '../entities/rusty-jobcards.entity';
import { RustyInvoiceItem } from '../entities/rusty-invoice-items.entity'; // ✅ new entity

@Injectable()
export class RustyService {
  constructor(
    @InjectRepository(RustyUser)
    private customerRepo: Repository<RustyUser>,

    @InjectRepository(Vehicle)
    private vehicleRepo: Repository<Vehicle>,

    @InjectRepository(RustyJobcard)
    private jobcardRepo: Repository<RustyJobcard>,

    @InjectRepository(JobcardsInvoice)
    private invoiceRepo: Repository<JobcardsInvoice>,

    @InjectRepository(RustyWorkshop)
    private workshopRepo: Repository<RustyWorkshop>,

    @InjectRepository(RustyInvoiceItem)
    private invoiceItemRepo: Repository<RustyInvoiceItem>, // ✅ inject repo
  ) {}

  private parseDate(value?: string | null) {
    if (!value || value === '0000-00-00 00:00:00') return null;
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  async populateData(body: any) {
    const customers = body.customers || [];
    const workshops = body.workshops || [];

    if (customers.length > 200) {
      return {
        success: false,
        message: 'Cannot import more than 200 customers at once',
        data: null,
        errors: ['Too many customers in one request'],
      };
    }

    let customerCount = 0;
    let vehicleCount = 0;
    let jobcardCount = 0;
    let invoiceCount = 0;
    let invoiceItemCount = 0;

    // Workshops first
    const jobcardWorkshops = new Map<string, any>();
    for (const cust of customers) {
      for (const veh of cust.vehicles || []) {
        for (const jc of veh.jobcards || []) {
          if (jc.workshop_id) {
            jobcardWorkshops.set(jc.workshop_id, { id: jc.workshop_id });
          }
        }
      }
    }

    const allWorkshops = [
      ...new Map(
        [...(workshops || []), ...jobcardWorkshops.values()].map((w) => [
          w.id,
          w,
        ]),
      ).values(),
    ];

    for (const ws of allWorkshops) {
      const workshop = this.workshopRepo.create({
        id: ws.id,
        shop_type: ws.shop_type || null,
        garage_code: ws.garage_code || null,
        shop_name: ws.shop_name || null,
        region: ws.region || null,
        city: ws.city || null,
        longitude: ws.longitude || null,
        latitude: ws.latitude || null,
        geo_coordinates: ws.geo_coordinates || null,
      });
      await this.workshopRepo.save(workshop);
    }

    // Customers → Vehicles → Jobcards → Invoices → Items
    for (const cust of customers) {
      const customer = this.customerRepo.create({
        id: cust.id,
        name: cust.name,
        type: cust.type,
        phone_number: cust.phone_number,
        email: cust.email,
        status: cust.status ? 1 : 0,
        country: cust.country,
        dob: cust.dob ? String(cust.dob) : null,
        address: cust.address,
        created_at: this.parseDate(cust.created_at),
        updated_at: this.parseDate(cust.updated_at),
      });
      await this.customerRepo.save(customer);
      customerCount++;

      for (const veh of cust.vehicles || []) {
        const vehicle = this.vehicleRepo.create({
          id: veh.id,
          dmid: veh.customer_id,
          vehicle_number: veh.vehicle_number,
          vehicle_category_id: veh.vehicle_category_id || null,
          vehicle_brand_id: veh.vehicle_brand?.id || null,
          vehicle_variant_id: veh.vehicle_variant?.id || null,
          year_of_manufacture: veh.year_of_manufacture
            ? Number(veh.year_of_manufacture)
            : null,
          transmission: veh.transmission || null,
          vin_number: veh.vin_number,
          created_at: this.parseDate(veh.created_at),
          updated_at: this.parseDate(veh.updated_at),
        });
        await this.vehicleRepo.save(vehicle);
        vehicleCount++;

        for (const jc of veh.jobcards || []) {
          const jobcard = this.jobcardRepo.create({
            id: jc.id,
            vehicle_id: veh.id,
            odometer: jc.odometer_reading ? Number(jc.odometer_reading) : null,
            vehicle_complaints: jc.vehicle_complaints || null,
            delivery_date: this.parseDate(jc.delivery_date),
            status: jc.status,
            workshop_id: jc.workshop_id || null,
            customer_id: jc.customer_id || null,
            completed_date: this.parseDate(jc.completed_date),
            created_at: this.parseDate(jc.created_at),
            updated_at: this.parseDate(jc.updated_at),
            source_of_customer: jc.source_of_customer || null,
          });
          await this.jobcardRepo.save(jobcard);
          jobcardCount++;

          if (jc.invoice) {
            const inv = jc.invoice;
            const invoice = this.invoiceRepo.create({
              id: inv.id,
              jobcard_id: jc.id,
              invoice_no: inv.invoice_no,
              total_amount: Number(inv.total_amount || 0),
              sub_total: Number(inv.sub_total || 0),
              total_tax_amount: Number(inv.total_tax_amount || 0),
              total_discount_amount: Number(inv.total_discount_amount || 0),
              workshop_id: inv.workshop_id || null,
              created_at: this.parseDate(inv.created_at),
              updated_at: this.parseDate(inv.updated_at),
            });
            await this.invoiceRepo.save(invoice);
            invoiceCount++;

            // ✅ Save services as invoice items
            for (const svc of inv.services || []) {
              const item = this.invoiceItemRepo.create({
                id: svc.id,
                jobcard_invoice_id: inv.id,
                quantity: 1, // services = 1 qty
                volume: 0,
                gst_percent_per_item: 0,
                discount_per_item: Number(svc.total_discount || 0),
                sub_total: Number(svc.before_tax || 0),
                total_amount: Number(svc.total_amount || 0),
                type: 'service',
                description: svc.service?.service_name || null,
                created_at: this.parseDate(inv.created_at) || new Date(),
                updated_at: this.parseDate(inv.updated_at) || new Date(),
                price: Number(svc.price || 0),
                gst_amount_per_item: Number(svc.tax_amount || 0),
                unique_key_spare: null,
              });
              await this.invoiceItemRepo.save(item);
              invoiceItemCount++;
            }

            // ✅ Save free_items if available
            for (const free of inv.free_items || []) {
              const item = this.invoiceItemRepo.create({
                id: free.id,
                jobcard_invoice_id: inv.id,
                quantity: Number(free.quantity || 1),
                volume: Number(free.volume || 0),
                gst_percent_per_item: Number(free.gst_percent_per_item || 0),
                discount_per_item: Number(free.discount_per_item || 0),
                sub_total: Number(free.sub_total || 0),
                total_amount: Number(free.total_amount || 0),
                type: 'free_item',
                description: free.description || null,
                created_at: this.parseDate(inv.created_at) || new Date(),
                updated_at: this.parseDate(inv.updated_at) || new Date(),
                price: Number(free.price || 0),
                gst_amount_per_item: Number(free.gst_amount_per_item || 0),
                unique_key_spare: free.unique_key_spare || null,
              });
              await this.invoiceItemRepo.save(item);
              invoiceItemCount++;
            }
          }
        }
      }
    }

    const lastInvoice = await this.invoiceRepo.findOne({
      where: {},
      order: { updated_at: 'DESC' },
    });

    const latestTimeStamp =
      lastInvoice?.updated_at?.toISOString().slice(0, 19).replace('T', ' ') ||
      null;

    return {
      success: true,
      message: 'Successfully imported data!',
      data: {
        time_stamp: latestTimeStamp,
        total_customers: customerCount,
        total_vehicles: vehicleCount,
        total_jobcards: jobcardCount,
        total_invoices: invoiceCount,
        total_invoice_items: invoiceItemCount,
      },
      errors: [],
    };
  }

  async getLatestTimestamp(): Promise<string | null> {
    const lastInvoice = await this.invoiceRepo.findOne({
      where: {},
      order: { updated_at: 'DESC' },
    });
    return (
      lastInvoice?.updated_at?.toISOString().slice(0, 19).replace('T', ' ') ||
      null
    );
  }
}
