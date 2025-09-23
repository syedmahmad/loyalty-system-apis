import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vehicle } from '../entities/vehicle.entity';
import { Customer } from 'src/customers/entities/customer.entity';
import axios from 'axios';
import { MakeEntity } from 'src/make/entities/make.entity';
import { ModelEntity } from 'src/model/entities/model.entity';
import { Log } from 'src/logs/entities/log.entity';

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
  ) {}

  async addCustomerVehicle(bodyPayload) {
    try {
      const { customer_id, tenantId, bUId } = bodyPayload;

      // Step 1: Find customer
      const customer = await this.customerRepo.findOne({
        where: {
          uuid: customer_id,
          business_unit: { id: parseInt(bUId) },
          tenant: { id: parseInt(tenantId) },
        },
      });

      if (!customer) throw new NotFoundException('Customer not found');

      if (customer && customer.status == 0) {
        throw new NotFoundException('Customer is inactive');
      }

      if (customer.status === 3) {
        throw new NotFoundException('Customer is deleted');
      }

      const makeInfo = await this.makeRepository.findOne({
        where: { makeId: bodyPayload.make_id },
      });

      const modelInfo = await this.modelRepository.findOne({
        where: { modelId: bodyPayload.model_id },
      });

      // Step 2: Find or create vehicle
      let vehicle = await this.vehiclesRepository.findOne({
        where: {
          customer: { id: customer.id },
          registration_number: bodyPayload.plate_no,
        },
      });

      if (vehicle && vehicle.status === 0) {
        // Reactivate the vehicle if it was inactive
        vehicle.status = 1;
      }

      if (vehicle) {
        // Update existing vehicle
        vehicle.vin_number = bodyPayload.vin;
        vehicle.year = bodyPayload.model_year;
        vehicle.make = makeInfo.name;
        vehicle.model = modelInfo.name;
        vehicle.make_id = bodyPayload.make_id;
        vehicle.model_id = bodyPayload.model_id;
      } else {
        // Insert new vehicle
        vehicle = this.vehiclesRepository.create({
          customer: { id: customer.id },
          registration_number: bodyPayload.plate_no,
          vin_number: bodyPayload.vin,
          year: bodyPayload.model_year,
          make: makeInfo?.name || null,
          model: modelInfo?.name || null,
          make_id: bodyPayload.make_id,
          model_id: bodyPayload.model_id,
        });
      }

      vehicle = await this.vehiclesRepository.save(vehicle);

      // Step 3: Sync with Resty
      const loginInfo = await this.customerLoginInResty();
      if (!loginInfo?.access_token) {
        return {
          success: false,
          message: 'Failed to authenticate with Resty',
          result: { vehicle },
          errors: loginInfo,
        };
      }

      const customerInfoFromResty = await this.getCustomerInfoFromResty({
        customer,
        loginInfo,
      });

      if (customerInfoFromResty.length) {
        const vehiclePayload = {
          customer_id: customer?.uuid,
          make: makeInfo?.name || null,
          model: makeInfo?.name || null,
          model_year: bodyPayload.model_year,
          plate_no: bodyPayload.plate_no,
          vin: bodyPayload.vin,
        };

        await this.manageVehicleInResty({
          vehiclePayload,
          loginInfo,
        });
      }

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
          business_unit: { id: parseInt(businessUnitId) },
          tenant: { id: parseInt(tenantId) },
        },
      });

      if (!customer) throw new NotFoundException('Customer not found');

      if (customer && customer.status == 0) {
        throw new NotFoundException('Customer is inactive');
      }

      if (customer.status === 3) {
        throw new NotFoundException('Customer is deleted');
      }

      const loginInfo = await this.customerLoginInResty();
      if (!loginInfo.access_token) {
        return {
          success: false,
          message: 'Authentication with Resty failed',
          result: {},
          errors: [loginInfo],
        };
      }

      const customerInfoFromResty = await this.getCustomerInfoFromResty({
        customer,
        loginInfo,
      });

      if (!customerInfoFromResty.length) {
        return {
          success: false,
          message: 'Customer not found in Resty',
          result: {},
          errors: [],
        };
      }

      const customerVehicles = await this.getVehicleInfoFromResty({
        customer_id: customerInfoFromResty[0].customer_id,
        loginInfo,
      });

      if (!customerVehicles.length) {
        return {
          success: true,
          message: 'No vehicles found in Resty',
          result: { vehicles: [] },
          errors: [],
        };
      }

      // 7. Get services for all vehicles from Resty
      const vehicleServices: any[] = [];

      for (const vehicle of customerVehicles) {
        const serviceList = await this.getVehicleServiceListFromResty({
          customer_id: customerInfoFromResty[0].customer_id,
          vehicle_id: vehicle.vehicle_id,
          loginInfo,
        });

        vehicleServices.push({
          vehicle_id: vehicle.vehicle_id,
          vin: vehicle.vin,
          plate_no: vehicle.plate_no,
          services: serviceList || [],
        });
      }

      return {
        success: true,
        message: 'Successfully fetched the data!',
        result: { vehicleServices },
        errors: [],
      };
    } catch (error: any) {
      const errResponse = error?.response?.data;
      return errResponse;
    }
  }

  async getCustomerVehicle({ customerId, tenantId, businessUnitId }) {
    try {
      // 1. Validate Customer
      const customer = await this.customerRepo.findOne({
        where: {
          uuid: customerId,
          business_unit: { id: parseInt(businessUnitId) },
          tenant: { id: parseInt(tenantId) },
        },
      });

      if (!customer) throw new NotFoundException('Customer not found');

      if (customer && customer.status == 0) {
        throw new NotFoundException('Customer is inactive');
      }

      if (customer.status === 3) {
        throw new NotFoundException('Customer is deleted');
      }

      // 2. Get local vehicles
      const localVehicles = await this.vehiclesRepository.find({
        where: { customer: { id: customer.id }, status: 1 },
      });

      // 3. Login to Resty
      const loginInfo = await this.customerLoginInResty();
      if (!loginInfo.access_token) {
        return {
          success: false,
          message: 'Authentication with Resty failed',
          result: {},
          errors: [loginInfo],
        };
      }

      // 4. Get Customer Info from Resty
      const customerInfoFromResty = await this.getCustomerInfoFromResty({
        customer,
        loginInfo,
      });

      if (!customerInfoFromResty.length) {
        return {
          success: false,
          message: 'Customer not found in Resty',
          result: {},
          errors: [],
        };
      }

      // 5. Get Vehicles from Resty
      const restyVehicles = await this.getVehicleInfoFromResty({
        customer_id: customerInfoFromResty[0].customer_id,
        loginInfo,
      });

      if (!restyVehicles.length) {
        return {
          success: true,
          message: 'No vehicles found in Resty',
          result: { vehicles: [] },
          errors: [],
        };
      }

      // 6. Compare and sync
      const localVinSet = new Set(
        localVehicles.map((v) => v.registration_number),
      );
      const newVehicles: any[] = [];

      for (const eachVehicle of restyVehicles) {
        if (!localVinSet.has(eachVehicle.plate_no)) {
          const makeInfo = await this.makeRepository.findOne({
            where: { name: eachVehicle.make },
          });

          const deactivatedVehicle = await this.vehiclesRepository.findOne({
            where: {
              customer: { id: customer.id },
              registration_number: eachVehicle.plate_no,
              status: 0, // only look for deactivated vehicles
            },
          });

          if (deactivatedVehicle) {
            continue; // Skip adding this vehicle as it's deactivated
          }

          const savedVehicle = await this.vehiclesRepository.save({
            make: eachVehicle.make,
            make_id: makeInfo?.makeId || null,
            model: eachVehicle.model,
            year: eachVehicle.model_year,
            registration_number: eachVehicle.plate_no,
            vin_number: eachVehicle.vin,
            customer: { id: customer.id },
            last_mileage: eachVehicle.last_mileage || null,
            last_service_date: eachVehicle.last_service_date || null,
          });

          newVehicles.push(savedVehicle);
        }
      }

      // 7. Prepare response list (union of local + newResty)
      const mergedVehicles =
        localVehicles.length === restyVehicles.length
          ? localVehicles
          : [...localVehicles, ...newVehicles];

      // map to consistent response format
      const vehicleArr = mergedVehicles.map((singleVehicle) => ({
        make: singleVehicle.make || null,
        model: singleVehicle.model || null,
        model_year: singleVehicle.year || null,
        plate_no: singleVehicle.registration_number || null,
        vin: singleVehicle.vin_number || null,
      }));

      return {
        success: true,
        message: 'Successfully fetched the data!',
        result: { vehicles: vehicleArr },
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

      // Log the axios.post call and equivalent curl command
      console.log('axios.post:', loginUrl, loginPayload, {
        headers: loginHeaders,
      });
      const curlCommand = [
        `curl -X POST "${loginUrl}"`,
        `-H "Content-Type: application/json"`,
        `-H "Authorization: Bearer ${process.env.RESTY_TOKEN || '5aa664e22cf91a1642b7c6aa65a7d13a5a5f386c23afa57c'}"`,
        `-d '${JSON.stringify(loginPayload)}'`,
      ].join(' ');
      console.log('Equivalent curl command:', curlCommand);

      const response = await axios.post(loginUrl, loginPayload, {
        headers: loginHeaders,
      });

      const logs = await this.logRepo.create({
        requestBody: JSON.stringify({
          username: `${process.env.RESTY_USERNAME}`,
          password: `${process.env.RESTY_PASSWORD}`,
        }),
        responseBody: JSON.stringify(response),
        url: `${process.env.RESTY_BASE_URL}/api/login`,
        method: 'POST',
        statusCode: 200,
      } as Log);
      await this.logRepo.save(logs);

      return response.data;
    } catch (error: any) {
      const errResponse = error?.response?.data;
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
    // const customerPhone = '0569845873'; for testing it is hardcoded
    const customerPhone = `+${customer.country_code}${customer.phone}`;
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
        requestBody: null,
        responseBody: JSON.stringify(response),
        url: `${process.env.RESTY_BASE_URL}/api/customer/search?param=${customerPhone}`,
        method: 'GET',
        statusCode: 200,
      } as Log);
      await this.logRepo.save(logs);

      return response.data;
    } catch (error: any) {
      const errResponse = error?.response?.data;
      const logs = await this.logRepo.create({
        requestBody: null,
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
        requestBody: null,
        responseBody: JSON.stringify(response),
        url: `${process.env.RESTY_BASE_URL}/api/customer/${customer_id}/vehicles`,
        method: 'GET',
        statusCode: 200,
      } as Log);
      await this.logRepo.save(logs);

      return response.data;
    } catch (error: any) {
      const errResponse = error?.response?.data;
      const logs = await this.logRepo.create({
        requestBody: null,
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
        vehiclePayload,
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
      const errResponse = error?.response?.data;
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
        requestBody: null,
        responseBody: JSON.stringify(response),
        url: `${process.env.RESTY_BASE_URL}/api/vehicle/${customer_id}/${vehicle_id}`,
        method: 'GET',
        statusCode: 200,
      } as Log);
      await this.logRepo.save(logs);

      return response.data;
    } catch (error: any) {
      const errResponse = error?.response?.data;
      const logs = await this.logRepo.create({
        requestBody: null,
        responseBody: JSON.stringify(error) || null,
        url: `${process.env.RESTY_BASE_URL}/api/vehicle/${customer_id}/${vehicle_id}`,
        method: 'GET',
        statusCode: 500,
      } as Log);
      await this.logRepo.save(logs);
      return errResponse;
    }
  }

  async softDeleteVehicle(vehicleId: string, customerId: string) {
    try {
      const vehicle = await this.vehiclesRepository.findOne({
        where: {
          id: parseInt(vehicleId),
          customer: {
            id: parseInt(customerId),
            status: 1, // Ensure customer is active
          },
          status: 1, // Ensure vehicle is active
        },
      });

      if (!vehicle) {
        throw new NotFoundException('Vehicle not found');
      }

      vehicle.status = 0; // Set status to inactive
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
