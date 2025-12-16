import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
import { AuthService } from 'src/petromin-it/auth/auth/auth.service';

import { GGMCommonAuth, GGMCommonAuthHeaders } from '@gogomotor/common-auth';
import { v4 as uuidv4 } from 'uuid';
import {
  CreateCarListingDto,
  GogoWebhookDto,
  MarkVehicleSoldDto,
} from '../dto/create-car-listing.dto';

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

    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
  ) {}

  /**
   * Add or update a vehicle for a customer.
   * If a vehicle with the same plate_no exists for any customer, transfer ownership to the new customer and update details.
   * If not, create a new vehicle for the customer.
   */
  async manageCustomerVehicle(tenantId, businessUnitId, body) {
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
        relations: ['business_unit', 'tenant'],
      });

      if (!customer) throw new NotFoundException('Customer not found');

      // Fetch make, model, and variant info in parallel
      const [makeInfo, modelInfo, variantInfo] = await Promise.all([
        this.makeRepository.findOne({ where: { makeId: make_id } }),
        this.modelRepository.findOne({ where: { modelId: model_id, year } }),
        this.variantRepository.findOne({ where: { variantId: variant_id } }),
      ]);

      // plate_no should not be updated if vehicle already exists (on update)
      const prePareData: any = {
        make: makeInfo?.name ?? null,
        make_ar: makeInfo?.nameAr ?? null,
        make_id: make_id ?? null,
        image: modelInfo?.logo
          ? modelInfo?.logo
          : `${process.env.VEHICLE_IMAGES_URL}${makeInfo?.logo}`,
        model: modelInfo?.name ? modelInfo?.name : null,
        model_ar: modelInfo?.nameAr ?? null,
        model_id: model_id ? model_id : -1,
        variant: variantInfo?.name ? variantInfo?.name : null,
        variant_ar: variantInfo?.nameAr ?? null,
        variant_id: variant_id ? variant_id : -1,
        vin_number: vin ?? null,
        // Do NOT include plate_no here by default, it will be conditionally set below
        year: modelInfo?.year ? modelInfo?.year : year,
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
        // new car value fields.
        carCondition: restBody?.carCondition ?? null,
        minPrice: restBody?.minPrice ?? null,
        maxPrice: restBody?.maxPrice ?? null,
        model_year_id: restBody?.model_year_id ?? null,
      };

      // Step 2: Find vehicle by plate_no (regardless of customer)
      let vehicle: any = await this.vehiclesRepository.findOne({
        where: {
          customer: { id: customer.id },
          plate_no: plate_no,
          status: 1, // not checking inactive or deleted. if deleted, create new.
        },
        relations: ['customer'],
      });

      if (vehicle) {
        // Don't update plate_no if vehicle already exists
        Object.assign(vehicle, prePareData);

        // UPDATE last_valuation_date ONLY if user update these values...
        if (body.minPrice && body.maxPrice && body.carCondition) {
          vehicle.last_valuation_date = new Date();
          // Update the specific condition inside car_value with new min and max
          vehicle.car_value = {
            ...vehicle.car_value,
            [body.carCondition]: {
              min: body.minPrice,
              max: body.maxPrice,
            },
          };
          // vehicle = await this.vehiclesRepository.save(vehicle);
        }
      } else {
        // Include plate_no only in creation
        // create car.
        vehicle = this.vehiclesRepository.create({
          customer: { id: customer.id },
          ...prePareData,
          plate_no: plate_no ?? null,
        });

        // get car valuation.
        // 🔹 Step X: Fetch car valuation from Gogomotor API
        try {
          // if (variantInfo?.variantId && year && restBody?.last_mileage) {
          if (!vehicle.car_value && variantInfo?.variantId && year) {
            const valuation = await this.getCarValuation({
              km: restBody?.last_mileage || 0,
              trimId: variantInfo?.variantId || variant_id, // cannot pass modelId as bluebook does not work with it.
              year,
            });
            // {
            //   fair: { min: 61138.22472, max: 74724.49687999999 },
            //   good: { min: 65514.6, max: 80073.4 },
            //   vGood: { min: 68429.9997, max: 83636.6663 },
            //   excellent: { min: 70991.62056, max: 86767.53624 }
            // }
            if (valuation?.data) {
              vehicle.last_valuation_date = new Date();
              const { good } = valuation.data;
              vehicle.car_value = valuation.data; // store only "data" object
              vehicle.carCondition = 'good';
              vehicle.minPrice = good.min;
              vehicle.maxPrice = good.max;
              // vehicle = await this.vehiclesRepository.save(vehicle);
            }
          }
        } catch (err) {
          console.error(
            'Car valuation integration failed:',
            err?.message || err,
          );
        }

        // give rewards points when someone adds new car
        await this.authService.rewardPoints(customer, 'Add New Car Points');
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

      await this.manageVehicleInResty({
        vehiclePayload: {
          ...vehicle,
          // TODO: once we apply merging API, we only get single customer
          customer_id: customerInfoFromResty[0]?.customer_id,
        },
        loginInfo,
      });

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

  async manageCustomerVehicleImages(tenantId, businessUnitId, body) {
    try {
      const { customer_id, plate_no, images } = body;

      if (
        !customer_id ||
        !plate_no ||
        !Array.isArray(images) ||
        images.length === 0
      ) {
        throw new Error('Missing customer_id, plate_no, or images.');
      }

      // 1. Validate customer
      const customer = await this.customerRepo.findOne({
        where: {
          uuid: customer_id,
          status: 1,
          business_unit: { id: parseInt(businessUnitId) },
          tenant: { id: parseInt(tenantId) },
        },
      });

      if (!customer) throw new NotFoundException('Customer not found');

      // 2. Find the vehicle
      const vehicle = await this.vehiclesRepository.findOne({
        where: {
          customer: { id: customer.id },
          plate_no,
          status: 1,
        },
        relations: ['customer'],
      });

      if (!vehicle) throw new NotFoundException('Vehicle not found');

      // const validatedImages: any[] = [];

      // // 3. Validate each image using GPT Vision API
      // for (const img of images) {
      //   if (!img.url) continue;

      //   const result = await this.openAIService.analyzeCarImage(img.url);

      //   validatedImages.push({
      //     type: img.type || result.type || 'unknown',
      //     url: img.url,
      //   });
      // }

      // 4. Save validated images into vehicle.images JSON field
      vehicle.images = images;
      await this.vehiclesRepository.save(vehicle);

      // const vehicleAfterUpdate = await this.vehiclesRepository.findOne({
      //   where: {
      //     customer: { id: customer.id },
      //     plate_no,
      //     status: 1,
      //   },
      //   relations: ['customer'],
      // });

      return {
        success: true,
        message: 'Vehicle images saved successfully.',
        // result: { vehicle: vehicleAfterUpdate },
        errors: [],
      };
    } catch (error) {
      console.error('manageCustomerVehicleImages Error:', error);
      return {
        success: false,
        message: error.message || 'Failed to manage vehicle images',
        result: {},
        errors: [error],
      };
    }
  }

  /**
   * Returns the service list(s) for all vehicles of a customer.
   * If plateNo is provided, returns only that vehicle. Otherwise, returns all vehicles.
   *
   * Previously picked only the first element from Resty.
   * There is no need to pick only the first: instead, process all vehicles belonging to the customer.
   */
  async getServiceList(bodyPayload) {
    const { customerId, plateNo, businessUnitId, tenantId } = bodyPayload;
    if (!customerId) throw new NotFoundException('Customer not found');
    try {
      // Step 1: Find customer in local DB
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
          // Only picking first customer for now
          customerVehicles = await this.getVehicleInfoFromResty({
            customer_id: customerInfoFromResty[0]?.customer_id, // resty works with his Ids, not our ids.
            loginInfo,
          });

          if (customerVehicles.length) {
            // Filter vehicles by plateNo if provided
            const filteredVehicles = plateNo
              ? customerVehicles.filter(
                  (vehicle) => vehicle.plate_no === plateNo,
                )
              : customerVehicles;

            // Parallelize fetching vehicle services for performance
            // mostly we will have only one vehicle, so we are not parallelizing here. as plateNo is provided, we are not fetching all vehicles.
            const allVehicleServices = (
              await Promise.all(
                filteredVehicles.map(async (vehicle) => {
                  const serviceList = await this.getVehicleServiceListFromResty(
                    {
                      customer_id: customerInfoFromResty[0]?.customer_id,
                      vehicle_id: vehicle.vehicle_id,
                      loginInfo,
                    },
                  );

                  // Only add vehicle if serviceList exists and is not null/undefined/empty
                  if (
                    !serviceList ||
                    !Array.isArray(serviceList) ||
                    serviceList.length === 0
                  ) {
                    return null;
                  }

                  // Add invoiceURL and feedback=null to each service
                  const servicesWithUrl = serviceList.map((val: any) => ({
                    ...val,
                    invoiceURL: 'https://www.gogomotor.com/', // need to hit another API call to get url from mac
                    feedback: null,
                  }));

                  return {
                    vehicle_id: vehicle.vehicle_id,
                    make: vehicle?.make,
                    model: vehicle?.model,
                    year: vehicle?.model_year,
                    last_mileage: vehicle?.last_mileage,
                    last_service_date: vehicle?.last_service_date,
                    vin: vehicle.vin,
                    plate_no: vehicle.plate_no,
                    services: servicesWithUrl,
                  };
                }),
              )
            ).filter(Boolean);
            vehicleServices.push(...allVehicleServices);
          }
        }
      }

      // Fetch feedbacks for all services, if any vehicleServices exist
      let feedbacks: any[] = [];
      if (vehicleServices.length) {
        try {
          const feedbackRes = await axios.get(
            `${process.env.DRAGON_WORKSHOPS_URL}/feedback?customer_id=${customerId}`,
            {
              headers: {
                'auth-key': process.env.DRAGON_WORKSHOPS_AUTH_KEY,
              },
            },
          );
          feedbacks = feedbackRes.data?.feedback?.workshop || [];
        } catch (err) {
          console.error(
            'Error fetching feedbacks:',
            err?.response?.data || err.message || err,
          );
        }
      }

      // Merge feedback onto each vehicle's services
      let updatedVehicleServices: any[] = [];
      if (feedbacks.length) {
        updatedVehicleServices = vehicleServices.map((vehicle) => ({
          ...vehicle,
          services: vehicle.services.map((service) => {
            const feedback = feedbacks.find(
              (fb) =>
                fb.workstation_code === service.BranchCode &&
                fb.workstation_name === service.BranchName &&
                fb.invoice_number === service.InvoiceNumber,
            );

            return {
              ...service,
              feedback: feedback
                ? {
                    rating: feedback.rating || '',
                  }
                : null,
            };
          }),
        }));
      }

      // Determine final result based on plateNo parameter and service availability
      const finalResult = updatedVehicleServices.length
        ? updatedVehicleServices
        : vehicleServices;

      // If no services found, return null
      if (!finalResult || finalResult.length === 0) {
        return {
          success: true,
          message: 'No services found for this customer',
          result: null,
          errors: [],
        };
      }

      // TODO: if vechile re-add only then return services that are done after re-add, else do nothing.
      // If plateNo is provided, return single object instead of array
      if (plateNo) {
        return {
          success: true,
          message: 'Successfully fetched the data!',
          result: finalResult[0], // Return first matching vehicle object, as that's what API expects
          errors: [],
        };
      }

      // Otherwise, return the full array
      return {
        success: true,
        message: 'Successfully fetched the data!',
        result: finalResult,
        errors: [],
      };
    } catch (error: any) {
      throw error;
    }
  }

  async getLastServiceFeedback(bodyPayload) {
    const { customerId, businessUnitId, tenantId } = bodyPayload;
    if (!customerId) throw new NotFoundException('Customer not found');
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

      // Step 2: Get all services for customer (similar to getServiceList but more efficient)
      let allServices: any[] = [];
      const loginInfo = await this.customerLoginInResty();
      if (loginInfo?.access_token) {
        const customerInfoFromResty = await this.getCustomerInfoFromResty({
          customer,
          loginInfo,
        });

        if (customerInfoFromResty.length) {
          const customerVehicles = await this.getVehicleInfoFromResty({
            customer_id: customerInfoFromResty[0].customer_id,
            loginInfo,
          });

          if (customerVehicles && customerVehicles.length) {
            // Get all services from all vehicles in parallel
            const allVehicleServices = await Promise.all(
              customerVehicles.map(async (vehicle) => {
                const serviceList = await this.getVehicleServiceListFromResty({
                  customer_id: customerInfoFromResty[0].customer_id,
                  vehicle_id: vehicle.vehicle_id,
                  loginInfo,
                });

                // Add vehicle info to each service
                return (serviceList || []).map((service) => ({
                  ...service,
                  vehicle_id: vehicle.vehicle_id,
                  make: vehicle.make,
                  model: vehicle.model,
                  year: vehicle.model_year,
                  plate_no: vehicle.plate_no,
                  vin: vehicle.vin,
                }));
              }),
            );

            // Flatten all services into one array
            allServices = allVehicleServices.flat();
          }
        }
      }

      // Step 3: Find the most recent service across all vehicles
      let lastService = null;
      if (allServices.length > 0) {
        lastService = allServices.reduce((latest, current) => {
          return new Date(current.InvoiceDate) > new Date(latest.InvoiceDate)
            ? current
            : latest;
        });
      }

      // Step 4: If no services found, return empty result
      if (!lastService) {
        return {
          success: true,
          message: 'No service history available for this customer',
          result: null,
          errors: [],
        };
      }

      console.log('////////////////lastService', lastService);

      // This code checks whether the vehicle associated with the last recorded service is still an active vehicle for the customer.
      // It first fetches the list of active vehicles for the customer from the local database (status: 1).
      // Then it creates a set of the plate numbers for these active vehicles.
      // If the plate number from the most recent service (lastService.plate_no) is not found among the customer's current active vehicles,
      // it returns a response indicating there is no service history available for this customer.
      // Otherwise, it allows the process to continue and return the last service information.
      const localVehicles = await this.vehiclesRepository.find({
        where: { customer: { id: customer.id }, status: 1 },
      });
      const localPlatNoSet = new Set(localVehicles.map((v) => v.plate_no));
      if (!localPlatNoSet.has(lastService?.plate_no)) {
        return {
          success: true,
          message: 'No service history available for this customer',
          result: null,
          errors: [],
        };
      }

      // Step 5: Fetch feedback for the last service
      let feedback = null;
      try {
        const feedbackRes = await axios.get(
          `${process.env.DRAGON_WORKSHOPS_URL}/feedback?customer_id=${customerId}`,
          {
            headers: {
              'auth-key': process.env.DRAGON_WORKSHOPS_AUTH_KEY,
            },
          },
        );

        const feedbacks = feedbackRes.data?.feedback?.workshop || [];
        feedback = feedbacks.find(
          (fb) =>
            fb.workstation_code === lastService.BranchCode &&
            fb.workstation_name === lastService.BranchName &&
            fb.invoice_number === lastService.InvoiceNumber,
        );
      } catch (err) {
        console.error(
          'Error fetching feedbacks:',
          err?.response?.data || err.message || err,
        );
      }

      // Step 6: Extract service items from the last service
      let serviceItems: string[] = [];

      // Check for different possible field names for service items
      if (
        lastService.service_items &&
        Array.isArray(lastService.service_items)
      ) {
        serviceItems = lastService.service_items.map((item: any) =>
          typeof item === 'string'
            ? item
            : item.ServiceName ||
              item.name ||
              item.item_name ||
              item.description ||
              String(item),
        );
      } else if (lastService.items && Array.isArray(lastService.items)) {
        serviceItems = lastService.items.map((item: any) =>
          typeof item === 'string'
            ? item
            : item.ServiceName ||
              item.name ||
              item.item_name ||
              item.description ||
              String(item),
        );
      } else if (lastService.Items && Array.isArray(lastService.Items)) {
        // Handle capitalized 'Items' as in upstream payload
        serviceItems = lastService.Items.map((item: any) =>
          typeof item === 'string'
            ? item
            : item.ServiceName ||
              item.name ||
              item.item_name ||
              item.description ||
              String(item),
        );
      } else if (lastService.services && Array.isArray(lastService.services)) {
        serviceItems = lastService.services.map((item: any) =>
          typeof item === 'string'
            ? item
            : item.ServiceName ||
              item.name ||
              item.item_name ||
              item.description ||
              String(item),
        );
      } else if (
        lastService.service_list &&
        Array.isArray(lastService.service_list)
      ) {
        serviceItems = lastService.service_list.map((item: any) =>
          typeof item === 'string'
            ? item
            : item.ServiceName ||
              item.name ||
              item.item_name ||
              item.description ||
              String(item),
        );
      }

      console.log('//////////////lastservice', lastService);

      // Step 7: Prepare response
      const result = {
        feedback: feedback
          ? {
              rating: feedback.rating || '',
            }
          : null,
        BranchCode: lastService.BranchCode,
        BranchName: lastService.BranchName,
        InvoiceNumber: lastService.InvoiceNumber,
        InvoiceDate: lastService.InvoiceDate,
        vehicle_id: lastService.vehicle_id,
        make: lastService.make,
        model: lastService.model,
        year: lastService.year,
        plate_no: lastService.plate_no,
        vin: lastService.vin,
        service_items: serviceItems,
      };

      return {
        success: true,
        message: feedback
          ? 'Successfully fetched the last service feedback!'
          : 'Last service found but no feedback available',
        result,
        errors: [],
      };
    } catch (error: any) {
      throw error;
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
            restyVehicles = null;
          }
        }

        if (restyVehicles) {
          // need to update logic here because
          // what if same vehicle is already added by someone else.
          // what if same vehicle is already added by the same customer.
          // what if same vehicle present in local but it status in inactive.
          // what if same customer deleted this vehicle, now not need to show him again.
          // what if customer deleted his account of his vehicle and wanted join us agian. In this case
          // we need to add his vehicle again.

          // 2. Get local vehicles, if customer re-add vehicles, these will come here, don't need to check
          // edither he has deleted or not.
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
              // we have deleted or inactive vehicles but resty does not have deleted or inactive funcitonlaity
              // in this case, we do nothing, will not include these vehicles.
              // Find all vehicles with this plate_no and status (deactivated/deleted), regardless of customer,
              // and also get associated customer(s) for each vehicle.
              const deactivatedVehicles = await this.vehiclesRepository.find({
                where: {
                  plate_no: eachVehicle.plate_no,
                  status: In([0, 3]), // look for deactivated or deleted vehicles
                },
                relations: ['customer'], // get all customer(s) related to these vehicles
              });

              if (deactivatedVehicles.length > 0) {
                const customerMobileHash = deactivatedVehicles.map(
                  (v) => v.customer.hashed_number,
                );
                if (customerMobileHash.includes(customer.hashed_number)) {
                  continue; // Skip adding this vehicle as it's deactivated by the same customer.
                }
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

              let variantInfo = null;
              if (modelInfo) {
                variantInfo = await this.variantRepository.findOne({
                  where: { model: { id: modelInfo.id } },
                });
              }

              const prePareData: any = {
                make: makeInfo?.name ?? null,
                make_ar: makeInfo?.nameAr ?? null,
                make_id: makeInfo?.makeId ?? null,
                image: modelInfo?.logo
                  ? modelInfo?.logo
                  : `${process.env.VEHICLE_IMAGES_URL}${makeInfo?.logo}`,
                model: modelInfo?.name ? modelInfo?.name : eachVehicle.model,
                model_ar: modelInfo?.nameAr ?? null,
                model_id: modelInfo?.modelId ? modelInfo?.modelId : -1,
                variant: variantInfo?.name ?? null,
                variant_ar: variantInfo?.nameAr ?? null,
                variant_id: variantInfo?.variantId
                  ? variantInfo?.variantId
                  : -1,
                vin_number: eachVehicle?.vin ?? null,
                plate_no: eachVehicle?.plate_no ?? null,
                year: eachVehicle?.model_year
                  ? eachVehicle?.model_year
                  : eachVehicle.model_year,
                fuel_type: variantInfo?.fuelTypeId?.toString() ?? null,
                fuel_type_name_en: variantInfo?.fuelType?.toString() ?? null,
                fuel_type_name_ar: variantInfo?.fuelTypeAr?.toString() ?? null,
                transmission: variantInfo?.transmissionId?.toString() ?? null,
                transmission_en: variantInfo?.transmission?.toString() ?? null,
                transmission_ar:
                  variantInfo?.transmissionAr?.toString() ?? null,
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
            } else {
              console.log('/////////////////else condition////////////');
              console.log('/////////////////else condition////////////');
              // Attempt to find an existing vehicle with the same plate_no and customer
              const existingVehicle = await this.vehiclesRepository.findOne({
                where: {
                  customer: { id: customer.id },
                  plate_no: eachVehicle?.plate_no ?? null,
                },
              });
              console.log(
                '/////////////////existingVehicle////////////',
                existingVehicle.last_service_date,
              );

              if (existingVehicle) {
                // Update the existing vehicle with the new data
                await this.vehiclesRepository.save({
                  ...existingVehicle,
                  vin_number: eachVehicle?.vin ?? existingVehicle.vin_number,
                  year: eachVehicle?.model_year
                    ? eachVehicle?.model_year
                    : eachVehicle.model_year,
                  last_mileage: eachVehicle.last_mileage,
                  last_service_date: eachVehicle.last_service_date,
                });
              }
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
      throw error;
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
    // const customerPhone = `+${customer.country_code}${customer.phone}`;
    const customerPhone = decrypt(customer.hashed_number);
    // console.log(customer.phone);
    // const customerPhone = '+966555657588';
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
    reason_for_deletion: string,
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
      vehicle.delete_requested_at = new Date();
      vehicle.reason_for_deletion = reason_for_deletion;
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

  async postToResty(endpoint: string, payload: any, loginInfo: any) {
    try {
      const response = await axios.post(
        `${process.env.RESTY_BASE_URL}/api${endpoint}`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${loginInfo.access_token}`,
            'Content-Type': 'application/json',
          },
        },
      );
      return response.data;
    } catch (error: any) {
      throw error?.response?.data || error;
    }
  }

  private async getCarValuation({
    km,
    trimId,
    year,
  }: {
    km: number;
    trimId: number;
    year: number;
  }) {
    try {
      // 1. Create auth client
      const authClient = new GGMCommonAuth({
        clientId: process.env.GGM_CLIENT_ID,
        clientSecret: process.env.GGM_CLIENT_SECRET,
        encryptionKey: process.env.GGM_ENC_KEY,
        encryptionIV: process.env.GGM_ENC_IV,
      });

      // 2. Get auth headers
      const res = authClient.getAccessToken();

      const headers = {
        [GGMCommonAuthHeaders.ClientId]: res.clientId,
        [GGMCommonAuthHeaders.AccessToken]: res.accessToken,
        [GGMCommonAuthHeaders.RequestId]: res.requestId || uuidv4(),
        [GGMCommonAuthHeaders.RequestTimestamp]: res.timestamp,
      };

      // 3. Hit Gogomotor API
      const url = `${process.env.GGM_BASE_URL}/get-valuation?km=${km}&trimId=${trimId}&year=${year}`;
      const { data } = await axios.get(url, { headers });

      // 4. Return valuation data
      return data;
    } catch (error: any) {
      console.error(
        'Error fetching car valuation:',
        error?.response?.data || error.message,
      );
      return null;
    }
  }

  async selfCarListing(body: CreateCarListingDto) {
    try {
      const customer_uuid = body.user.customer_id;

      const customer = await this.customerRepo.findOne({
        where: { uuid: customer_uuid },
      });

      if (!customer) {
        throw new BadRequestException(
          'Customer not found against provided uuid',
        );
      }

      const vehicle = await this.vehiclesRepository.findOne({
        where: {
          plate_no: body.plate_no,
          status: 1,
          customer: { id: customer.id },
        },
      });

      if (!vehicle) {
        throw new BadRequestException(
          `Vehicle not found aginst this customer and plate_no`,
        );
      }

      // 1. Create auth client
      const authClient = new GGMCommonAuth({
        clientId: process.env.GGM_CLIENT_ID,
        clientSecret: process.env.GGM_CLIENT_SECRET,
        encryptionKey: process.env.GGM_ENC_KEY,
        encryptionIV: process.env.GGM_ENC_IV,
      });

      // 2. Get auth headers
      const res = authClient.getAccessToken();

      const headers = {
        [GGMCommonAuthHeaders.ClientId]: res.clientId,
        [GGMCommonAuthHeaders.AccessToken]: res.accessToken,
        [GGMCommonAuthHeaders.RequestId]: res.requestId || uuidv4(),
        [GGMCommonAuthHeaders.RequestTimestamp]: res.timestamp,
      };

      // 3. Hit Gogomotor API
      const url = `${process.env.GGM_BASE_URL}/vehicle-details`;
      const { data } = await axios.post(url, body, { headers });

      await this.vehiclesRepository.update(
        { id: vehicle.id },
        {
          ggm_url: data.data.myAccountUrl,
          asking_price: body.askingPrice,
          listing_status: data.data?.vehicleStatus || '',
        },
      );

      // 4. Return valuation data
      return { message: 'Vehicle Added', data: data.data, errors: [] };
    } catch (error: any) {
      console.error(
        'Error fetching car listing:',
        error?.response?.data || error.message,
      );
      // throw new BadRequestException(
      //   `Vehicle Not added`,
      //   error?.response?.data || error.message,
      // );
      if (error?.response?.data || error.message) {
        throw new BadRequestException(error?.response?.data || error.message);
      } else {
        throw new BadRequestException({
          message: ['Vehicle Not added'],
          error: 'Request Error',
          statusCode: 500,
        });
      }
    }
  }

  async markAsSold(dto: MarkVehicleSoldDto) {
    const { plate_no, customerId } = dto;

    const vehicle = await this.vehiclesRepository.findOne({
      where: { plate_no: plate_no },
      relations: ['customer'],
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (vehicle.customer?.uuid !== customerId) {
      throw new ForbiddenException(
        'You are not allowed to mark this vehicle as sold',
      );
    }

    vehicle.listing_status = ''; // Sold

    await this.vehiclesRepository.save(vehicle);

    return {
      success: true,
      message: 'Vehicle Marked as Sold',
    };
  }

  async removeVehicleFromGogoMotor(dto: MarkVehicleSoldDto) {
    const { plate_no, customerId } = dto;

    const vehicle = await this.vehiclesRepository.findOne({
      where: { plate_no: plate_no },
      relations: ['customer'],
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (vehicle.customer?.uuid !== customerId) {
      throw new ForbiddenException(
        'You are not allowed to mark this vehicle as sold',
      );
    }

    return {
      success: true,
      message: 'Vehicle deleted Successfully',
    };
  }

  async updateVehicleDetailsOnGogoMotor(dto: MarkVehicleSoldDto) {
    const { plate_no, customerId } = dto;

    const vehicle = await this.vehiclesRepository.findOne({
      where: { plate_no: plate_no },
      relations: ['customer'],
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (vehicle.customer?.uuid !== customerId) {
      throw new ForbiddenException(
        'You are not allowed to mark this vehicle as sold',
      );
    }

    return {
      success: true,
      message: 'Vehicle details updated Successfully',
    };
  }

  private parseDate(value: any): Date | null {
    if (!value) return null;

    // If it's already a Date
    if (value instanceof Date) return value;

    // If timestamp (number/string)
    if (!isNaN(Number(value))) {
      const date = new Date(Number(value));
      return isNaN(date.getTime()) ? null : date;
    }

    // Try parse ISO / string formats
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  async handleGogoWebhook(dto: GogoWebhookDto) {
    const { plate_no, km, asking_price, listing_status, images } = dto;

    if (!plate_no) {
      // Throwing exception lets nestjs set correct 400/422 code in response
      throw new BadRequestException('plate_no is required');
    }

    // STEP 1: Find vehicle
    const vehicle = await this.vehiclesRepository.findOne({
      where: { plate_no, status: 1 },
      relations: ['customer'],
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    // STEP 2: Validate images format if provided
    if (images) {
      const isValid = this.validateGogoImageFormat(images);
      if (!isValid) {
        throw new BadRequestException('Please send proper images format');
      }
      vehicle.images = images;
    }

    // STEP 3: Update asking price
    if (asking_price !== undefined) {
      vehicle.asking_price = asking_price;
    }

    // STEP 4: Update listing_status
    if (listing_status !== undefined) {
      vehicle.listing_status = listing_status;
    }

    // STEP 5: Update KM
    if (km !== undefined) {
      vehicle.last_mileage = km;
    }
    vehicle.last_valuation_date = new Date();
    // STEP 6: If sold → soft delete
    // if (listing_status?.toLowerCase() === 'sold') {
    //   vehicle.status = 3;
    //   vehicle.delete_requested_at = new Date();
    //   vehicle.reason_for_deletion = 'Sold on GoGoMotor platform';
    // }

    await this.vehiclesRepository.save(vehicle);

    return {
      success: true,
      message: 'Vehicle updated via webhook',
      // result: { vehicle },
      // errors: [],
    };
  }

  private validateGogoImageFormat(images: any[]): boolean {
    if (!Array.isArray(images)) return false;

    return images.every(
      (img) =>
        img &&
        typeof img.url === 'string' &&
        typeof img.type === 'string' &&
        img.url.startsWith('http'),
    );
  }
}
