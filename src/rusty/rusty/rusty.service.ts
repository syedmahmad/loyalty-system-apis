import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RustyUser } from '../entities/rusty-users.entity';
import { RustyWorkshop } from '../entities/rusty-workshops.entity';
import { JobcardsInvoice } from '../entities/rusty-invoices.entity';
import { Vehicle } from '../entities/rusty-vehicles.entity';
import { RustyJobcard } from '../entities/rusty-jobcards.entity';
import { Service as RustyServiceEntity } from '../entities/rusty-services.entity';

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

    @InjectRepository(RustyServiceEntity)
    private serviceRepo: Repository<RustyServiceEntity>, // still useful for master service definitions
  ) {}

  /**
   * ✅ API 1: Save bulk data pushed from Datamart
   */
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

    /**
     * ✅ Step 1: Collect all workshops
     */
    const jobcardWorkshops = new Map<string, any>();

    for (const cust of customers) {
      for (const veh of cust['vehicles'] || []) {
        for (const jc of veh['jobcards'] || []) {
          if (jc['workshop_id']) {
            jobcardWorkshops.set(jc['workshop_id'], { id: jc['workshop_id'] });
          }
        }
      }
    }

    const allWorkshops = [
      ...new Map(
        [...(workshops || []), ...jobcardWorkshops.values()].map((w) => [
          w['id'],
          w,
        ]),
      ).values(),
    ];

    // ✅ Step 2: Save workshops
    for (const ws of allWorkshops) {
      const workshop = this.workshopRepo.create({
        id: ws['id'],
        shop_type: ws['shop_type'] || null,
        garage_code: ws['garage_code'] || null,
        shop_name: ws['shop_name'] || null,
        region: ws['region'] || null,
        city: ws['city'] || null,
        longitude: ws['longitude'] || null,
        latitude: ws['latitude'] || null,
        geo_coordinates: ws['geo_coordinates'] || null,
      });
      await this.workshopRepo.save(workshop);
    }

    /**
     * ✅ Step 3: Save customers → vehicles → jobcards → invoices
     */
    for (const cust of customers) {
      const customer = this.customerRepo.create({
        id: cust['id'],
        name: cust['name'],
        type: cust['type'],
        phone_number: cust['phone_number'],
        email: cust['email'],
        status: cust['status'] === true ? 1 : 0,
        country: cust['country'],
        dob: cust['dob'] ? String(cust['dob']) : null,
        address: cust['address'],
        created_at: cust['created_at'] ? new Date(cust['created_at']) : null,
        updated_at: cust['updated_at'] ? new Date(cust['updated_at']) : null,
      });
      await this.customerRepo.save(customer);
      customerCount++;

      // vehicles
      for (const veh of cust['vehicles'] || []) {
        const vehicle = this.vehicleRepo.create({
          id: veh['id'],
          dmid: veh['customer_id'], // optional mapping
          vehicle_number: veh['vehicle_number'],
          vehicle_category_id: veh['vehicle_category_id'] || null,
          vehicle_brand_id: veh['vehicle_brand']?.['id'] || null,
          vehicle_variant_id: veh['vehicle_variant']?.['id'] || null,
          year_of_manufacture: veh['year_of_manufacture']
            ? Number(veh['year_of_manufacture'])
            : null,
          transmission: veh['transmission'] || null,
          vin_number: veh['vin_number'],
          created_at: veh['created_at'] ? new Date(veh['created_at']) : null,
          updated_at: veh['updated_at'] ? new Date(veh['updated_at']) : null,
        });
        await this.vehicleRepo.save(vehicle);
        vehicleCount++;

        // jobcards
        for (const jc of veh['jobcards'] || []) {
          const jobcard = this.jobcardRepo.create({
            id: jc['id'],
            vehicle_id: veh['id'],
            odometer: jc['odometer_reading']
              ? Number(jc['odometer_reading'])
              : null,
            vehicle_complaints: jc['vehicle_complaints'] || null,
            delivery_date: jc['delivery_date']
              ? new Date(jc['delivery_date'])
              : null,
            status: jc['status'],
            workshop_id: jc['workshop_id'] || null,
            customer_id: jc['customer_id'] || null,
            completed_date: jc['completed_date']
              ? new Date(jc['completed_date'])
              : null,
            created_at: jc['created_at'] ? new Date(jc['created_at']) : null,
            updated_at: jc['updated_at'] ? new Date(jc['updated_at']) : null,
            source_of_customer: jc['source_of_customer'] || null,
          });
          await this.jobcardRepo.save(jobcard);
          jobcardCount++;

          // invoices
          if (jc['invoice']) {
            const inv = jc['invoice'];
            const invoice = this.invoiceRepo.create({
              id: inv['id'],
              jobcard_id: jc['id'],
              invoice_no: inv['invoice_no'],
              total_amount: Number(inv['total_amount'] || 0),
              sub_total: Number(inv['sub_total'] || 0),
              total_tax_amount: Number(inv['total_tax_amount'] || 0),
              total_discount_amount: Number(inv['total_discount_amount'] || 0),
              workshop_id: inv['workshop_id'] || null,
              services: inv['services'] || [], // ✅ store as JSON array
              created_at: inv['created_at']
                ? new Date(inv['created_at'])
                : null,
              updated_at: inv['updated_at']
                ? new Date(inv['updated_at'])
                : null,
            });
            await this.invoiceRepo.save(invoice);
            invoiceCount++;
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
      message: 'Successfully imported data!...',
      data: {
        time_stamp: latestTimeStamp,
        total_customers: customerCount,
        total_vehicles: vehicleCount,
        total_jobcards: jobcardCount,
        total_invoices: invoiceCount,
      },
      errors: [],
    };
  }

  /**
   * ✅ API 2: Return latest timestamp stored in system
   */
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
