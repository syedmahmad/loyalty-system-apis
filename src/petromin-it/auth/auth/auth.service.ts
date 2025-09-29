import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GetOtpDto, VerifyOtpDto } from 'src/petromin-it/auth/dto/auth.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Customer } from 'src/customers/entities/customer.entity';
import { OciService } from 'src/oci/oci.service';
import { v4 as uuidv4 } from 'uuid';
import { CustomerService } from 'src/customers/customer.service';
import { QrCode } from 'src/qr_codes/entities/qr_code.entity';
import { decrypt, encrypt } from 'src/helpers/encryption';
import { TriggerSMS } from 'src/helpers/triggerSMS';
import { TriggerWhatsapp } from 'src/helpers/triggerWhatsapp';
import { Log } from 'src/logs/entities/log.entity';
import { WalletService } from 'src/wallet/wallet/wallet.service';
import { nanoid } from 'nanoid';
import { VehiclesService } from 'src/vehicles/vehicles/vehicles.service';
import {
  ProfileSelectionStatus,
  RestyCustomerProfileSelection,
} from 'src/customers/entities/resty_customer_profile_selection.entity';
// import { Referral } from 'src/wallet/entities/referrals.entity';
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(RestyCustomerProfileSelection)
    private readonly restyCustomerProfileSelectionRepo: Repository<RestyCustomerProfileSelection>,
    private readonly ociService: OciService,
    private readonly customerService: CustomerService,
    @InjectRepository(QrCode)
    private readonly qrCodeRepo: Repository<QrCode>,
    @InjectRepository(Log)
    private readonly logRepo: Repository<Log>,
    private readonly walletService: WalletService,
    // @InjectRepository(Referral)
    // private readonly refRepo: Repository<Referral>,
    private readonly vehicleService: VehiclesService,
  ) {}

  // Generate and send OTP, upsert customer by mobileNumber, store OTP with 5-min expiry
  async getOtp(body: GetOtpDto): Promise<any> {
    try {
      const businessUnitId = process.env.NCMC_PETROMIN_BU;
      const tenantId = process.env.NCMC_PETROMIN_TENANT;
      const plainMobile = body.mobileNumber.trim();

      if (!businessUnitId || !tenantId) {
        throw new BadRequestException('Missing tenant or business unit');
      }

      const encryptedPhone = await this.ociService.encryptData(plainMobile);
      const hashedPhone = encrypt(plainMobile);

      let customer = await this.customerRepo.findOne({
        where: {
          hashed_number: hashedPhone,
          status: In([0, 1]), // only active customer
          business_unit: { id: parseInt(businessUnitId) },
          tenant: { id: parseInt(tenantId) },
        },
        relations: ['business_unit', 'tenant'],
      });

      if (!customer) {
        // The original code only creates a new customer entity in memory, but does not save it to the database,
        // so the customer.id is not generated yet. To get the newly created id, you must save the entity first.
        customer = this.customerRepo.create({
          phone: encryptedPhone,
          hashed_number: hashedPhone,
          business_unit: { id: parseInt(businessUnitId) },
          tenant: { id: parseInt(tenantId) },
          uuid: uuidv4(),
          status: 0,
          is_new_user: 1,
          // Use nanoid for unique referral_code generation (Nest.js uses nanoid for unique IDs)
          referral_code: nanoid(6).toUpperCase(),
        });
      }

      // Generate a 4-digit OTP as a string
      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      // Set OTP expiry time to 5 minutes from now
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      // Assign OTP and expiry to customer entity
      let testUsers: string[] = [];
      try {
        testUsers = JSON.parse(process.env.TEST_USERS || '[]');
      } catch {
        testUsers = [];
      }

      // Only set OTP and expiry if not a test user
      if (!testUsers.includes(hashedPhone)) {
        customer.otp_code = otp;
        customer.otp_expires_at = expiresAt;
      }

      // Save customer with new OTP info
      customer = await this.customerRepo.save(customer); // Save to DB to get the generated id

      const qrcode = await this.qrCodeRepo.findOne({
        where: { customer: { id: customer.id } },
      });
      if (!qrcode) {
        await this.customerService.createAndSaveCustomerQrCode(
          customer.uuid,
          customer.id,
        );
      }

      const wallet = await this.walletService.getSingleCustomerWalletInfo(
        customer.id,
        Number(businessUnitId),
      );

      if (!wallet) {
        // Create a wallet for the new customer
        await this.walletService.createWallet({
          customer_id: customer.id,
          business_unit_id: Number(businessUnitId),
          tenant_id: Number(tenantId),
        });
      }

      // trigger sms
      // Send OTP via SMS and WhatsApp in parallel, but don't block on them
      if (!testUsers.includes(hashedPhone)) {
        Promise.all([
          TriggerSMS(encryptedPhone, otp, body.language_code, this.logRepo),
          TriggerWhatsapp(
            encryptedPhone,
            otp,
            body.language_code,
            this.logRepo,
          ),
        ]).catch(() => {
          // Optionally log or handle errors, but don't block the main flow
        });
      }

      return {
        success: true,
        message: 'OTP send to your mobile',
        result: null,
      };
    } catch (error) {
      return {
        success: false,
        message: error?.message || 'Failed',
        result: null,
      };
    }
  }

  // Verify OTP; on success return tenant_uuid, business_unit_uuid and QR url
  async verifyOtp(body: VerifyOtpDto): Promise<any> {
    try {
      const businessUnitId = process.env.NCMC_PETROMIN_BU;
      const tenantId = process.env.NCMC_PETROMIN_TENANT;
      if (!businessUnitId || !tenantId) {
        throw new BadRequestException('Missing tenant or business unit');
      }

      const { otp, mobileNumber } = body;
      if (!otp || !mobileNumber) {
        return {
          success: false,
          message: 'otp and mobileNumber are required',
          result: null,
        };
      }

      const plainMobile = body.mobileNumber.trim();
      const hashedPhone = encrypt(plainMobile);
      const customer = await this.customerRepo.findOne({
        where: {
          hashed_number: hashedPhone,
          status: In([0, 1]), // only active customer
          business_unit: { id: parseInt(businessUnitId) },
          tenant: { id: parseInt(tenantId) },
        },
        relations: ['business_unit', 'tenant'],
      });

      if (!customer) throw new NotFoundException('Customer not found');
      const customerWallet =
        await this.walletService.getSingleCustomerWalletInfoById(customer.id);
      if (!customerWallet)
        throw new NotFoundException('Customer Wallet Not Found');
      if (!customer.otp_code || !customer.otp_expires_at)
        throw new BadRequestException('OTP not generated');
      if (String(customer.otp_code) !== String(otp))
        throw new BadRequestException('Invalid OTP');
      if (new Date(customer.otp_expires_at).getTime() < Date.now())
        throw new BadRequestException('OTP Expired');

      // give him signup points
      if (customer && customer.login_count === 0) {
        // customer.is_new_user = 0;
        customer.status = 1;
        // reward signup points
        const earnSignupPoints = {
          customer_id: customer.uuid,
          event: 'Signup Points', // this is important what if someone changes this event name form Frontend
          tenantId: String(customer.tenant.id),
          BUId: String(customer.business_unit.id),
        };
        try {
          const earnedPoints =
            await this.customerService.earnWithEvent(earnSignupPoints);
          // log the external call
          const logs = await this.logRepo.create({
            requestBody: JSON.stringify(earnSignupPoints),
            responseBody: JSON.stringify(earnedPoints),
            url: earnSignupPoints.event,
            method: 'POST',
            statusCode: 200,
          } as Log);
          await this.logRepo.save(logs);
        } catch (err) {
          const logs = await this.logRepo.create({
            requestBody: JSON.stringify(earnSignupPoints),
            responseBody: JSON.stringify(err),
            url: earnSignupPoints.event,
            method: 'POST',
            statusCode: 200,
          } as Log);
          await this.logRepo.save(logs);
        }
        // Additional Points for Phone
        const earnAddPhonePoints = {
          customer_id: customer.uuid,
          event: 'Additional Points for Phone', // this is important what if someone changes this event name form Frontend
          tenantId: String(customer.tenant.id),
          BUId: String(customer.business_unit.id),
        };
        try {
          const earnedPoints =
            await this.customerService.earnWithEvent(earnAddPhonePoints);
          // log the external call
          const logs = await this.logRepo.create({
            requestBody: JSON.stringify(earnAddPhonePoints),
            responseBody: JSON.stringify(earnedPoints),
            url: earnAddPhonePoints.event,
            method: 'POST',
            statusCode: 200,
          } as Log);
          await this.logRepo.save(logs);
        } catch (err) {
          const logs = await this.logRepo.create({
            requestBody: JSON.stringify(earnAddPhonePoints),
            responseBody: JSON.stringify(err),
            url: earnAddPhonePoints.event,
            method: 'POST',
            statusCode: 200,
          } as Log);
          await this.logRepo.save(logs);
        }
      }
      customer.login_count += 1;
      // for this test uesr, do not delete it. +966583225664 Code is 7118

      // Only clear OTP if hashedPhone is not in TEST_USERS array
      // Use JSON.parse to handle TEST_USERS as a JSON array from env
      let testUsers: string[] = [];
      try {
        testUsers = JSON.parse(process.env.TEST_USERS || '[]');
      } catch {
        testUsers = [];
      }
      if (!testUsers.includes(hashedPhone)) {
        customer.otp_code = null;
        customer.otp_expires_at = null;
      } else {
        // only works for test users
        // Remove any RestyCustomerProfileSelection records for this test user (by hashed phone number)
        await this.restyCustomerProfileSelectionRepo.delete({
          phone_number: hashedPhone,
        });
      }
      await this.customerRepo.save(customer);
      const qr = await this.qrCodeRepo.findOne({
        where: { customer: { id: customer.id } },
      });
      const qrUrl = qr.qr_code_url;

      // Optimized Resty profile selection logic
      const localCustomerInRestyTable =
        await this.restyCustomerProfileSelectionRepo.findOne({
          where: { phone_number: hashedPhone },
        });

      // Helper to build the common result object
      const buildResult = () => ({
        customer_id: customer.uuid,
        tenant_id: customer.tenant?.uuid || customer.tenant.uuid,
        business_unit_id:
          customer.business_unit?.uuid || customer.business_unit.uuid,
        qr_code_url: qrUrl,
        is_new_user: customer.is_new_user,
      });

      // If no local profile selection, integrate with Resty
      if (!localCustomerInRestyTable) {
        // Login to Resty with timeout
        let loginInfo: any = null;
        try {
          loginInfo = await Promise.race([
            this.vehicleService.customerLoginInResty(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('resty Login timeout')), 3000),
            ),
          ]);
        } catch {
          // Ignore login errors, treat as not logged in
        }

        if (!loginInfo?.access_token) {
          // If not logged in, just return success with local info
          return {
            success: true,
            message: 'Success',
            result: buildResult(),
          };
        }

        // Get customer profiles from Resty with timeout
        let customerInfoFromResty: any = null;
        try {
          customerInfoFromResty = await Promise.race([
            this.vehicleService.getCustomerInfoFromResty({
              customer,
              loginInfo,
            }),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error('resty get customer timeout')),
                3000,
              ),
            ),
          ]);
        } catch {
          // Ignore errors, treat as no profiles
        }

        // Defensive: if not array or empty, treat as single empty profile
        if (
          !Array.isArray(customerInfoFromResty) ||
          customerInfoFromResty.length === 0
        ) {
          const customersData = this.restyCustomerProfileSelectionRepo.create({
            phone_number: hashedPhone,
            all_profiles: [], // this represent, this cusotmer not belongs to us.
            selected_profile: {
              customer_id: customer.uuid,
              customer_name: customer.name,
              email: customer.email,
              mobile: decrypt(customer.hashed_number),
            },
            status: ProfileSelectionStatus.SELECTED,
            created_at: new Date(),
            updated_at: new Date(),
          });
          await this.restyCustomerProfileSelectionRepo.save(customersData);
          return {
            success: true,
            message: 'Success',
            result: buildResult(),
          };
        }

        // Save profiles in local table
        const now = new Date();
        if (customerInfoFromResty.length > 1) {
          // Multiple profiles: status PENDING
          const customersData = this.restyCustomerProfileSelectionRepo.create({
            phone_number: hashedPhone,
            all_profiles: customerInfoFromResty,
            status: ProfileSelectionStatus.PENDING,
            created_at: now,
            updated_at: now,
          });
          await this.restyCustomerProfileSelectionRepo.save(customersData);

          return {
            success: true,
            message: 'Success',
            result: { ...buildResult(), customers: customerInfoFromResty },
          };
        } else {
          // Single profile: status SELECTED
          const customersData = this.restyCustomerProfileSelectionRepo.create({
            phone_number: hashedPhone,
            all_profiles: customerInfoFromResty,
            selected_profile: customerInfoFromResty[0],
            status: ProfileSelectionStatus.SELECTED,
            created_at: now,
            updated_at: now,
          });
          await this.restyCustomerProfileSelectionRepo.save(customersData);

          return {
            success: true,
            message: 'Success',
            result: buildResult(),
          };
        }
      }

      // If already selected or pending, return accordingly
      if (
        localCustomerInRestyTable.status === ProfileSelectionStatus.SELECTED
      ) {
        return {
          success: true,
          message: 'Success',
          result: buildResult(),
        };
      }

      if (localCustomerInRestyTable.status === ProfileSelectionStatus.PENDING) {
        return {
          success: true,
          message: 'Success',
          result: {
            buildResult,
            customers: localCustomerInRestyTable.all_profiles,
          },
        };
      }

      return {
        success: true,
        message: 'Success',
        result: buildResult(),
      };
    } catch (error) {
      return {
        success: false,
        message: error?.message || 'Failed',
        result: null,
      };
    }
  }

  async saveSelectedProfile(
    phone_number: string,
    selected_profile: Record<string, any>,
  ): Promise<any> {
    // TODO: once resty provide merging API, we cal it form here.
    try {
      const hashedPhone = encrypt(phone_number);
      const localCustomerInRestyTable =
        await this.restyCustomerProfileSelectionRepo.findOne({
          where: { phone_number: hashedPhone },
        });

      if (!localCustomerInRestyTable) {
        throw new NotFoundException(
          'No profile selection request found for this phone number',
        );
      }

      localCustomerInRestyTable.selected_profile = selected_profile;
      localCustomerInRestyTable.status = ProfileSelectionStatus.SELECTED;
      localCustomerInRestyTable.updated_at = new Date();

      await this.restyCustomerProfileSelectionRepo.save(
        localCustomerInRestyTable,
      );

      return {
        success: true,
        message: 'Profile selection saved successfully',
        result: null,
      };
    } catch (error) {
      return {
        success: false,
        message: error?.message || 'Failed to save profile selection',
        result: null,
      };
    }
  }
}
