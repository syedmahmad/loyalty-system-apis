import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Vehicle } from '../entities/vehicle.entity';
import { Customer } from 'src/customers/entities/customer.entity';
import axios from 'axios';
import { MakeEntity } from 'src/make/entities/make.entity';
import { ModelEntity } from 'src/model/entities/model.entity';
import { Log } from 'src/logs/entities/log.entity';
import { decrypt } from 'src/helpers/encryption';
import { VariantEntity } from 'src/variant/entities/variant.entity';
// import { FuelType } from 'src/variant/entities/variant.enum';
// import { decrypt } from 'src/helpers/encryption';

@Injectable()
export class VehiclesService {
  constructor(
    @InjectRepository(Vehicle)
    private vehiclesRepository: Repository<Vehicle>,

    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,

    @InjectRepository(Log)
    private readonly logRepo: Repository<Log>,

    @InjectRepository(MakeEntity)
    private readonly makeRepository: Repository<MakeEntity>,

    @InjectRepository(ModelEntity)
    private readonly modelRepository: Repository<ModelEntity>,

    @InjectRepository(VariantEntity)
    private readonly variantRepository: Repository<VariantEntity>,
  ) {}

  /**
   * Add or update a vehicle for a customer.
   * If a vehicle with the same plate_no exists for any customer, transfer ownership to the new customer and update details.
   * If not, create a new vehicle for the customer.
   */
  async manageCustomerVehicle(tenantId, businessUnitId, body) {
    console.log('loginInfo//////////');
    try {
      // Destructure and parse IDs up front
      const {
        customer_id,
        make_id,
        model_id,
        variant_id,
        year,
        plate_no,
        vin,
        ...restBody
      } = body;
      const parsedBusinessUnitId = parseInt(businessUnitId);
      const parsedTenantId = parseInt(tenantId);

      // Step 1: Find customer
      const customer = await this.customerRepo.findOne({
        where: {
          uuid: customer_id,
          status: 1,
          business_unit: { id: parsedBusinessUnitId },
          tenant: { id: parsedTenantId },
        },
      });

      if (!customer) throw new NotFoundException('Customer not found');

      // Fetch make, model, and variant info in parallel
      const [makeInfo, modelInfo, variantInfo] = await Promise.all([
        this.makeRepository.findOne({ where: { makeId: make_id } }),
        this.modelRepository.findOne({ where: { modelId: model_id, year } }),
        this.variantRepository.findOne({ where: { variantId: variant_id } }),
      ]);

      const prePareData: any = {
        make: makeInfo?.name ?? null,
        make_ar: makeInfo?.nameAr ?? null,
        make_id: make_id ?? null,
        image: makeInfo?.logo ?? null,
        model: modelInfo?.name ?? null,
        model_ar: modelInfo?.nameAr ?? null,
        model_id: model_id ?? null,
        variant: variantInfo?.name ?? null,
        variant_ar: variantInfo?.nameAr ?? null,
        variant_id: variant_id ?? null,
        vin_number: vin ?? null,
        plate_no: plate_no ?? null,
        year: year ?? null,
        color: restBody?.color ?? null,
        engine: restBody?.engine ?? null,
        body_type: restBody?.body_type ?? null,
        fuel_type: variantInfo?.fuelType?.toString() ?? null,
        transmission: variantInfo?.transmission?.toString() ?? null,
        last_mileage: restBody?.last_mileage ?? null,
        last_service_date: restBody?.last_service_date ?? null,
        owner_name: restBody?.owner_name ?? null,
        owner_id: restBody?.owner_id ?? null,
        user_id: restBody?.user_id ?? null,
        registeration_type: restBody?.registeration_type ?? null,
        registeration_date: restBody?.registeration_date ?? null,
        registeration_no: restBody?.registeration_no ?? null,
        sequence_no: restBody?.sequence_no ?? null,
        national_id: restBody?.national_id ?? null,
      };

      // Step 2: Find vehicle by plate_no (regardless of customer)
      let vehicle: any = await this.vehiclesRepository.findOne({
        where: {
          plate_no: plate_no,
        },
        relations: ['customer'],
      });

      if (vehicle) {
        // If the vehicle exists and belongs to a different customer, transfer ownership
        if (vehicle.customer?.id !== customer.id) {
          vehicle.customer = { id: customer.id };
        }
        Object.assign(vehicle, prePareData);
      } else {
        // Create new vehicle for this customer
        vehicle = this.vehiclesRepository.create({
          customer: { id: customer.id },
          ...prePareData,
        });
      }

      vehicle = await this.vehiclesRepository.save(vehicle);

      // Step 3: Sync with Resty
      let loginInfo: any;
      try {
        // Set a timeout for the login call (e.g., 3 seconds)
        loginInfo = await Promise.race([
          this.customerLoginInResty(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Login timeout')), 3000),
          ),
        ]);
      } catch (err) {
        // If timeout or any error, proceed without loginInfo
        loginInfo = null;
      }
      if (!loginInfo?.access_token) {
        // TODO: need to discuss with team
        return {
          success: true,
          message: 'Vehicle added successfully',
          result: { vehicle },
          errors: [],
        };
      }

      // Step 3: Sync with Resty
      let customerInfoFromResty: any;
      try {
        // Set a timeout for the login call (e.g., 3 seconds)
        customerInfoFromResty = await Promise.race([
          this.getCustomerInfoFromResty({
            customer,
            loginInfo,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Login timeout')), 3000),
          ),
        ]);
      } catch (err) {
        // If timeout or any error, proceed without loginInfo
        customerInfoFromResty = null;
      }

      if (!customerInfoFromResty.length) {
        // TODO: need to discuss with team
        return {
          success: true,
          message: 'Vehicle added successfully',
          result: { vehicle },
          errors: [],
        };
      }

      console.log('/////////After getting customer form resty//////');

      const restyresponseVehicles = await this.manageVehicleInResty({
        vehiclePayload: {
          ...vehicle,
          // TODO: need to find customer master profiel and add this vehicle agisnt it.
          customer_id: customerInfoFromResty[0].customer_id,
        },
        loginInfo,
      });

      console.log(
        'restyresponseVehicles////////////////',
        restyresponseVehicles,
      );

      return {
        success: true,
        message: 'Vehicle added successfully',
        result: { vehicle },
        errors: [],
      };
    } catch (error) {
      console.error('addCustomerVehicle Error:', error);

      return {
        success: false,
        message: error?.message || 'Unexpected error while adding vehicle',
        result: {},
        errors: error?.response?.data || [error],
      };
    }
  }

  async getServiceList(bodyPayload) {
    const { customerId, businessUnitId, tenantId } = bodyPayload;
    try {
      // Step 1: Find customer
      const customer = await this.customerRepo.findOne({
        where: {
          uuid: customerId,
          status: 1,
          business_unit: { id: parseInt(businessUnitId) },
          tenant: { id: parseInt(tenantId) },
        },
      });

      if (!customer) throw new NotFoundException('Customer not found');

      let customerVehicles = [];
      const vehicleServices: any[] = [];

      const loginInfo = await this.customerLoginInResty();
      if (loginInfo?.access_token) {
        const customerInfoFromResty = await this.getCustomerInfoFromResty({
          customer,
          loginInfo,
        });

        if (customerInfoFromResty.length) {
          // TODO: can get multiple customers, currently picking only first.
          customerVehicles = await this.getVehicleInfoFromResty({
            customer_id: customerInfoFromResty[0].customer_id,
            loginInfo,
          });

          if (customerVehicles.length) {
            for (const vehicle of customerVehicles) {
              const serviceList = await this.getVehicleServiceListFromResty({
                customer_id: customerInfoFromResty[0]?.customer_id,
                vehicle_id: vehicle.vehicle_id,
                loginInfo,
              });

              vehicleServices.push({
                vehicle_id: vehicle.vehicle_id,
                make: vehicle?.make,
                model: vehicle?.model,
                year: vehicle?.model_year,
                last_mileage: vehicle?.last_mileage,
                last_service_date: vehicle?.last_service_date,
                vin: vehicle.vin,
                plate_no: vehicle.plate_no,
                services: serviceList || [],
              });
            }
          }
        }
      }

      return {
        success: true,
        message: 'Successfully fetched the data!',
        result: { vehicleServices },
        errors: [],
      };
    } catch (error: any) {
      const errResponse = error?.response;
      return errResponse;
    }
  }

  async getCustomerVehicle({ customerId, tenantId, businessUnitId }) {
    try {
      // 1. Validate Customer
      const customer = await this.customerRepo.findOne({
        where: {
          uuid: customerId,
          status: 1,
          business_unit: { id: parseInt(businessUnitId) },
          tenant: { id: parseInt(tenantId) },
        },
      });

      if (!customer) throw new NotFoundException('Customer not found');

      // 3. Login to Resty
      const loginInfo = await this.customerLoginInResty();
      if (loginInfo?.access_token) {
        //TODO: it could return multiple customers profile, so we need to take decision here.
        // but for now, we are only getting first profile.
        // 4. Get Customer Info from Resty
        const customerInfoFromResty = await this.getCustomerInfoFromResty({
          customer,
          loginInfo,
        });
        let restyVehicles = null;
        if (customerInfoFromResty.length) {
          // 5. Get Vehicles from Resty
          restyVehicles = await this.getVehicleInfoFromResty({
            customer_id: customerInfoFromResty[0].customer_id,
            loginInfo,
          });

          if (!restyVehicles.length) {
            // return {
            //   success: true,
            //   message: 'No vehicles found in Resty',
            //   result: { vehicles: [] },
            //   errors: [],
            // };
            restyVehicles = null;
          }
        }

        if (restyVehicles) {
          // 2. Get local vehicles
          const localVehicles = await this.vehiclesRepository.find({
            where: { customer: { id: customer.id }, status: 1 },
          });
          // 6. Compare and sync
          const localVinSet = new Set(localVehicles.map((v) => v.plate_no));

          for (const eachVehicle of restyVehicles) {
            // if new record comes from resty which does not exist in local vehicles
            // add them in local vehicles but
            // do not again add deleted or inactive vehicles.
            if (!localVinSet.has(eachVehicle.plate_no)) {
              const deactivatedVehicle = await this.vehiclesRepository.findOne({
                where: {
                  customer: { id: customer.id },
                  plate_no: eachVehicle.plate_no,
                  status: In([0, 3]), // look for deactivated or deleted vehicles
                },
              });

              if (deactivatedVehicle) {
                continue; // Skip adding this vehicle as it's deactivated
              }

              // Fetch make, model, and variant info in parallel
              const [makeInfo, modelInfo] = await Promise.all([
                this.makeRepository.findOne({
                  where: { name: eachVehicle.make },
                }),
                this.modelRepository.findOne({
                  where: {
                    name: eachVehicle.model,
                    year: eachVehicle.model_year,
                  },
                }),
              ]);

              const variantInfo = await this.variantRepository.findOne({
                where: { model: { id: modelInfo.id } },
              });

              const prePareData: any = {
                make: makeInfo?.name ?? null,
                make_ar: makeInfo?.nameAr ?? null,
                make_id: makeInfo?.makeId ?? null,
                image: makeInfo?.logo ?? null,
                model: modelInfo?.name ?? null,
                model_ar: modelInfo?.nameAr ?? null,
                model_id: modelInfo?.modelId ?? null,
                variant: variantInfo?.name ?? null,
                variant_ar: variantInfo?.nameAr ?? null,
                variant_id: variantInfo?.variantId ?? null,
                vin_number: eachVehicle?.vin ?? null,
                plate_no: eachVehicle?.plate_no ?? null,
                year: eachVehicle?.model_year ?? null,
                fuel_type: variantInfo?.fuelType?.toString() ?? null,
                transmission: variantInfo?.transmission?.toString() ?? null,
                // color: eachVehicle?.color ?? null,
                // engine: eachVehicle?.engine ?? null,
                // body_type: eachVehicle?.body_type ?? null,
                // owner_name: eachVehicle?.owner_name ?? null,
                // owner_id: eachVehicle?.owner_id ?? null,
                // user_id: eachVehicle?.user_id ?? null,
                // registeration_type: eachVehicle?.registeration_type ?? null,
                // registeration_date: eachVehicle?.registeration_date ?? null,
                // registeration_no: eachVehicle?.registeration_no ?? null,
                // sequence_no: eachVehicle?.sequence_no ?? null,
                // national_id: eachVehicle?.national_id ?? null,
              };

              await this.vehiclesRepository.save({
                ...prePareData,
                customer: { id: customer.id },
                last_mileage: eachVehicle.last_mileage || null,
                last_service_date: eachVehicle.last_service_date || null,
              });
            }
          }
        }
      }

      // 7. Prepare response list (union of local + newResty)
      const combineVehicles = await this.vehiclesRepository.find({
        where: { customer: { id: customer.id }, status: 1 },
      });

      return {
        success: true,
        message: 'Successfully fetched the data!',
        result: { vehicles: combineVehicles },
        errors: [],
      };
    } catch (error) {
      console.error('getCustomerVehicle Error:', error);
      return {
        success: false,
        message: error.message || 'Something went wrong',
        result: {},
        errors: [error],
      };
    }
  }

  async customerLoginInResty() {
    try {
      // Prepare request data
      const loginUrl = `${process.env.RESTY_BASE_URL.replace(/\/$/, '')}/api/login`;
      const loginPayload = {
        username: process.env.RESTY_USERNAME,
        password: process.env.RESTY_PASSWORD,
      };
      const loginHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESTY_TOKEN || '5aa664e22cf91a1642b7c6aa65a7d13a5a5f386c23afa57c'}`,
      };

      const response = await axios.post(loginUrl, loginPayload, {
        headers: loginHeaders,
      });

      const restyRespose = response.data;

      const logs = await this.logRepo.create({
        requestBody: JSON.stringify({
          username: `${process.env.RESTY_USERNAME}`,
          password: `${process.env.RESTY_PASSWORD}`,
        }),
        responseBody: JSON.stringify(restyRespose),
        url: `${process.env.RESTY_BASE_URL}/api/login`,
        method: 'POST',
        statusCode: 200,
      } as Log);
      await this.logRepo.save(logs);

      return restyRespose;
    } catch (error: any) {
      const errResponse = error?.response;
      const logs = await this.logRepo.create({
        requestBody: JSON.stringify({
          username: `${process.env.RESTY_USERNAME}`,
          password: `${process.env.RESTY_PASSWORD}`,
        }),
        responseBody: JSON.stringify(error) || null,
        url: `${process.env.RESTY_BASE_URL}/api/login`,
        method: 'POST',
        statusCode: 500,
      } as Log);
      await this.logRepo.save(logs);
      return errResponse;
    }
  }

  async getCustomerInfoFromResty({ customer, loginInfo }) {
    console.log('///////customer, customer', customer);
    // const customerPhone = `+${customer.country_code}${customer.phone}`;
    // const customerPhone = decrypt(customer.hashed_number);
    const customerPhone = '+966532537561';
    try {
      const response = await axios.get(
        `${process.env.RESTY_BASE_URL}/api/customer/search?param=${customerPhone}`,
        {
          headers: {
            Authorization: `Bearer ${loginInfo.access_token}`,
            'Content-Type': 'application/json',
          },
        },
      );
      const logs = await this.logRepo.create({
        requestBody: JSON.stringify({
          param: customerPhone,
        }),
        responseBody: JSON.stringify(response.data),
        url: `${process.env.RESTY_BASE_URL}/api/customer/search?param=${customerPhone}`,
        method: 'GET',
        statusCode: 200,
      } as Log);
      await this.logRepo.save(logs);

      return response.data;
    } catch (error: any) {
      const errResponse = error?.response;
      const logs = await this.logRepo.create({
        requestBody: JSON.stringify({
          param: customerPhone,
        }),
        responseBody: JSON.stringify(error) || null,
        url: `${process.env.RESTY_BASE_URL}/api/customer/search?param=${customerPhone}`,
        method: 'GET',
        statusCode: 500,
      } as Log);
      await this.logRepo.save(logs);
      return errResponse;
    }
  }

  async getVehicleInfoFromResty({ customer_id, loginInfo }) {
    try {
      const response = await axios.get(
        `${process.env.RESTY_BASE_URL}/api/customer/${customer_id}/vehicles`,
        {
          headers: {
            Authorization: `Bearer ${loginInfo.access_token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const logs = await this.logRepo.create({
        requestBody: JSON.stringify({
          param: customer_id,
        }),
        responseBody: JSON.stringify(response.data),
        url: `${process.env.RESTY_BASE_URL}/api/customer/${customer_id}/vehicles`,
        method: 'GET',
        statusCode: 200,
      } as Log);
      await this.logRepo.save(logs);

      return response.data;
    } catch (error: any) {
      const errResponse = error?.response;
      const logs = await this.logRepo.create({
        requestBody: JSON.stringify({
          param: customer_id,
        }),
        responseBody: JSON.stringify(error) || null,
        url: `${process.env.RESTY_BASE_URL}/api/customer/${customer_id}/vehicles`,
        method: 'GET',
        statusCode: 500,
      } as Log);
      await this.logRepo.save(logs);
      return errResponse;
    }
  }

  async manageVehicleInResty({ vehiclePayload, loginInfo }) {
    try {
      const response = await axios.post(
        `${process.env.RESTY_BASE_URL}/api/vehicle/manage`,
        [vehiclePayload],
        {
          headers: {
            Authorization: `Bearer ${loginInfo.access_token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const logs = await this.logRepo.create({
        requestBody: JSON.stringify(vehiclePayload),
        responseBody: JSON.stringify(response),
        url: `${process.env.RESTY_BASE_URL}/api/vehicle/manage`,
        method: 'POST',
        statusCode: 200,
      } as Log);
      await this.logRepo.save(logs);

      return response.data;
    } catch (error: any) {
      const errResponse = error?.response;
      const logs = await this.logRepo.create({
        requestBody: JSON.stringify(vehiclePayload),
        responseBody: JSON.stringify(error) || null,
        url: `${process.env.RESTY_BASE_URL}/api/vehicle/manage`,
        method: 'POST',
        statusCode: 500,
      } as Log);
      await this.logRepo.save(logs);
      return errResponse;
    }
  }

  async getVehicleServiceListFromResty({ customer_id, vehicle_id, loginInfo }) {
    try {
      const response = await axios.get(
        `${process.env.RESTY_BASE_URL}/api/vehicle/${customer_id}/${vehicle_id}`,
        {
          headers: {
            Authorization: `Bearer ${loginInfo.access_token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const logs = await this.logRepo.create({
        requestBody: JSON.stringify({
          customer_id: customer_id,
          vehicle_id: vehicle_id,
        }),
        responseBody: JSON.stringify(response.data),
        url: `${process.env.RESTY_BASE_URL}/api/vehicle/${customer_id}/${vehicle_id}`,
        method: 'GET',
        statusCode: 200,
      } as Log);
      await this.logRepo.save(logs);

      return response.data;
    } catch (error: any) {
      const errResponse = error?.response;
      const logs = await this.logRepo.create({
        requestBody: JSON.stringify({
          customer_id: customer_id,
          vehicle_id: vehicle_id,
        }),
        responseBody: JSON.stringify(error) || null,
        url: `${process.env.RESTY_BASE_URL}/api/vehicle/${customer_id}/${vehicle_id}`,
        method: 'GET',
        statusCode: 500,
      } as Log);
      await this.logRepo.save(logs);
      return errResponse;
    }
  }

  async softDeleteVehicle(
    tenantId: string,
    businessUnitId: string,
    platNo: string,
    customerId: string,
  ) {
    try {
      const customer = await this.customerRepo.findOne({
        where: {
          uuid: customerId,
          status: 1,
          business_unit: { id: parseInt(businessUnitId) },
          tenant: { id: parseInt(tenantId) },
        },
      });

      if (!customer) throw new NotFoundException('Customer not found');

      const vehicle = await this.vehiclesRepository.findOne({
        where: {
          plate_no: platNo,
          customer: {
            id: customer.id,
            status: 1, // Ensure customer is active
          },
          status: 1, // Ensure vehicle is active
        },
      });

      if (!vehicle) {
        throw new NotFoundException('Vehicle not found');
      }

      vehicle.status = 3; // Set status to deelte
      await this.vehiclesRepository.save(vehicle);

      return {
        success: true,
        message: 'Vehicle deactivated successfully',
        result: {},
        errors: [],
      };
    } catch (error) {
      console.error('softDeleteVehicle Error:', error);
      return {
        success: false,
        message: error.message || 'Something went wrong',
        result: {},
        errors: [error],
      };
    }
  }
}
