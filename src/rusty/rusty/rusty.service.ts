import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RustyCustomer } from '../entities/rusty-customers.entity';
import { RustyWorkshop } from '../entities/rusty-workshops.entity';
import { RustyInvoice } from '../entities/rusty-invoices.entity';
import { RustyVehicle } from '../entities/rusty-vehicles.entity';
import { RustyJobcard } from '../entities/rusty-jobcards.entity';
import { RustyService as RustyServiceEntity } from '../entities/rusty-services.entity';

@Injectable()
export class RustyService {
  constructor(
    @InjectRepository(RustyCustomer)
    private customerRepo: Repository<RustyCustomer>,

    @InjectRepository(RustyVehicle)
    private vehicleRepo: Repository<RustyVehicle>,

    @InjectRepository(RustyJobcard)
    private jobcardRepo: Repository<RustyJobcard>,

    @InjectRepository(RustyInvoice)
    private invoiceRepo: Repository<RustyInvoice>,

    @InjectRepository(RustyWorkshop)
    private workshopRepo: Repository<RustyWorkshop>,

    @InjectRepository(RustyServiceEntity)
    private serviceRepo: Repository<RustyServiceEntity>,
  ) {}

  /**
   * ✅ API 1: Save bulk data pushed from Datamart
   */
  async populateData(body: any) {
    let latestTimestamp: string | null = null;

    const customers = body.customers || [];
    const workshops = body.workshops || [];

    let customerCount = 0;
    let vehicleCount = 0;
    let jobcardCount = 0;
    let invoiceCount = 0;

    /**
     * ✅ Step 1: Extract all workshops from both body.workshops and jobcards
     * to make sure referenced workshops exist before inserting jobcards.
     */
    const jobcardWorkshops = new Map<string, any>();

    for (const cust of customers) {
      for (const veh of cust['vehicles'] || []) {
        for (const jc of veh['jobcards'] || []) {
          if (jc['workshop_id']) {
            jobcardWorkshops.set(jc['workshop_id'], {
              id: jc['workshop_id'],
            });
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

    // ✅ Step 2: Save workshops first
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
     * ✅ Step 3: Save customers, vehicles, jobcards, invoices, services
     */
    for (const cust of customers) {
      const customer = this.customerRepo.create({
        id: cust['id'],
        name: cust['name'],
        type: cust['type'],
        phone_number: cust['phone_number'],
        email: cust['email'],
        status: cust['status'] === true,
        country: cust['country'],
        dob: cust['dob'] ? String(cust['dob']) : null,
        address: cust['address'],
        created_at: new Date(cust['created_at']),
        updated_at: new Date(cust['updated_at']),
      });
      await this.customerRepo.save(customer);
      customerCount++;

      latestTimestamp = customer.updated_at
        ?.toISOString()
        .slice(0, 19)
        .replace('T', ' ');

      // vehicles
      for (const veh of cust['vehicles'] || []) {
        const vehicle = this.vehicleRepo.create({
          id: veh['id'],
          customer,
          vehicle_number: veh['vehicle_number'],
          vehicle_category_id: veh['vehicle_category_id'] || null,
          vehicle_brand_id: veh['vehicle_brand']?.['id'] || null,
          vehicle_brand_name: veh['vehicle_brand']?.['name'] || null,
          vehicle_variant_id: veh['vehicle_variant']?.['id'] || null,
          vehicle_variant_name: veh['vehicle_variant']?.['name'] || null,
          year_of_manufacture: veh['year_of_manufacture'],
          transmission: veh['transmission'] || null,
          vin_number: veh['vin_number'],
          created_at: new Date(veh['created_at']),
          updated_at: new Date(veh['updated_at']),
        });
        await this.vehicleRepo.save(vehicle);
        vehicleCount++;

        // jobcards
        for (const jc of veh['jobcards'] || []) {
          const jobcard = this.jobcardRepo.create({
            id: jc['id'],
            vehicle,
            odometer_reading: jc['odometer_reading'],
            vehicle_complaints: jc['vehicle_complaints'] || null,
            delivery_date: jc['delivery_date']
              ? new Date(jc['delivery_date'])
              : null,
            status: jc['status'],
            workshop: { id: jc['workshop_id'] }, // ✅ relation object
            customer_id: jc['customer_id'] || null,
            completed_date: jc['completed_date']
              ? new Date(jc['completed_date'])
              : null,
            created_at: new Date(jc['created_at']),
            updated_at: new Date(jc['updated_at']),
            source_of_customer: jc['source_of_customer'] || null,
          });
          await this.jobcardRepo.save(jobcard);
          jobcardCount++;

          // invoices
          if (jc['invoice']) {
            const inv = jc['invoice'];
            const invoice = this.invoiceRepo.create({
              id: inv['id'],
              jobcard,
              invoice_no: inv['invoice_no'],
              total_amount: inv['total_amount'],
              sub_total: inv['sub_total'],
              total_tax_amount: inv['total_tax_amount'],
              total_discount_amount: inv['total_discount_amount'],
              workshop_id: inv['workshop_id'],
              created_at: new Date(inv['created_at']),
              updated_at: new Date(inv['updated_at']),
            });
            await this.invoiceRepo.save(invoice);
            invoiceCount++;

            // services
            for (const svc of inv['services'] || []) {
              const service = this.serviceRepo.create({
                invoice,
                invoice_service_id: svc['id'],
                invoice_service_package_id: svc['invoice_service_package_id'],
                serviceId: svc['service']?.['id'],
                serviceGroupName: svc['service']?.['service_group_name'],
                serviceName: svc['service']?.['service_name'],
                price: svc['price'],
                beforeDiscount: svc['before_discount'],
                totalDiscount: svc['total_discount'],
                beforeTax: svc['before_tax'],
                taxAmount: svc['tax_amount'],
                totalAmount: svc['total_amount'],
              });
              await this.serviceRepo.save(service);
            }
          }
        }
      }
    }

    return {
      success: true,
      message: 'Successfully imported data!...',
      data: {
        time_stamp: latestTimestamp,
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
      order: { updated_at: 'DESC' },
    });
    return (
      lastInvoice?.updated_at?.toISOString().slice(0, 19).replace('T', ' ') ||
      null
    );
  }
}
