import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vehicle } from '../entities/vehicle.entity';
import { Customer } from 'src/customers/entities/customer.entity';
import { encrypt } from 'src/helpers/encryption';
import axios from 'axios';

@Injectable()
export class VehiclesService {
  constructor(
    @InjectRepository(Vehicle)
    private vehiclesRepository: Repository<Vehicle>,

    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
  ) {}

  async getCustomerVehicle({ customerId, tenantId, businessUnitId }) {
    const customer = await this.customerRepo.findOne({
      where: [
        {
          uuid: customerId,
          business_unit: { id: parseInt(businessUnitId) },
        },
        {
          hashed_number: encrypt(customerId),
          business_unit: { id: parseInt(businessUnitId) },
        },
      ],
    });

    if (!customer) throw new NotFoundException('Customer not found');

    // First we will search vehicle in our DB, If not found then we will seach in resty DB
    const vehicles = await this.vehiclesRepository.find({
      where: {
        customer: { id: customer.id },
      },
    });
    if (vehicles.length) {
      const vehicleArr = [];
      for (let index = 0; index <= vehicles.length - 1; index++) {
        const singleVehicle = vehicles[index];
        vehicleArr.push({
          make: singleVehicle.make || null,
          model: singleVehicle.model || null,
          model_year: singleVehicle.year || null,
          plate_no: singleVehicle.registration_number || null,
          vin: singleVehicle.vin_number || null,
        });
      }

      return {
        success: true,
        message: 'Successfully fetched the data! 111',
        result: {
          vehicles: vehicleArr,
        },
        errors: [],
      };
    }

    // login user to resty
    const loginInfo = await this.customerLoginInResty();
    if (loginInfo.access_token) {
      const customerInfoFromResty = await this.getCustomerInfoFromResty({
        customer,
        loginInfo,
      });

      if (customerInfoFromResty.length) {
        const customerVehicles = await this.getVehicleInfoFromResty({
          customer_id: customerInfoFromResty[0].customer_id,
          loginInfo,
        });

        if (customerVehicles.length) {
          for (let index = 0; index <= customerVehicles.length - 1; index++) {
            const eachVehicle = customerVehicles[index];

            await this.vehiclesRepository.save({
              make: eachVehicle.make,
              model: eachVehicle.model,
              year: eachVehicle.model_year,
              registration_number: eachVehicle.plate_no,
              vin_number: eachVehicle.vin,
              customer: { id: customer.id },
              last_mileage: eachVehicle.last_mileage || null,
              last_service_date: eachVehicle.last_service_date || null,
            });
          }

          return {
            success: true,
            message: 'Successfully fetched the data!',
            result: {
              vehicles: customerVehicles,
            },
            errors: [],
          };
        } else {
          return {
            success: true,
            message: 'no record found',
            result: {},
            errors: customerVehicles,
          };
        }
      } else {
        return {
          success: false,
          message: 'no record found',
          result: {},
          errors: customerInfoFromResty,
        };
      }
    } else {
      return {
        success: false,
        message: 'no record found',
        result: {},
        errors: loginInfo,
      };
    }
  }

  async customerLoginInResty() {
    try {
      const response = await axios.post(
        `${process.env.RESTY_BASE_URL}/api/login`,
        {
          username: 'natcdev',
          password: 'P3tr0m!n@2025',
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.RESTY_TOKEN}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return response.data;
    } catch (error: any) {
      const errResponse = error?.response?.data;
      return errResponse;
    }
  }

  async getCustomerInfoFromResty({ customer, loginInfo }) {
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

      return response.data;
    } catch (error: any) {
      const errResponse = error?.response?.data;
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

      return response.data;
    } catch (error: any) {
      const errResponse = error?.response?.data;
      return errResponse;
    }
  }
}
