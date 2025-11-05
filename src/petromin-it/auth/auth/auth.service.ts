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
          status: In([0, 1, 2]), // only active customer
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

      console.log('//////////////hashedPhone', hashedPhone);
      // Only set OTP and expiry if not a test user
      if (!testUsers.includes(plainMobile)) {
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
      if (!testUsers.includes(plainMobile)) {
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

      const plainMobile = mobileNumber.trim();
      const hashedPhone = encrypt(plainMobile);

      // Find customer by phone, BU, tenant
      const customer = await this.customerRepo.findOne({
        where: {
          hashed_number: hashedPhone,
          status: In([0, 1, 2]), // only active customer
          business_unit: { id: +businessUnitId },
          tenant: { id: +tenantId },
        },
        relations: ['business_unit', 'tenant'],
      });

      if (!customer) throw new NotFoundException('Customer not found');

      // Fetch wallet
      const customerWallet =
        await this.walletService.getSingleCustomerWalletInfoById(customer.id);
      if (!customerWallet)
        throw new NotFoundException('Customer Wallet Not Found');

      // OTP validation
      if (!customer.otp_code || !customer.otp_expires_at)
        throw new BadRequestException('OTP not generated');
      if (String(customer.otp_code) !== String(otp))
        throw new BadRequestException('Invalid OTP');
      if (new Date(customer.otp_expires_at).getTime() < Date.now())
        throw new BadRequestException('OTP Expired');

      // Update login count
      customer.login_count += 1;
      if (customer.login_count === 1) {
        // customer.is_new_user = 0; this will remain 0 because referral_code updates this.
        // Making status active, so earn-with-events methods can assign points.
        customer.status = 1;
      }

      // Only clear OTP if not a test user
      let testUsers: string[] = [];
      try {
        testUsers = JSON.parse(process.env.TEST_USERS || '[]');
      } catch {
        testUsers = [];
      }

      if (testUsers.includes(plainMobile)) {
        // Only works for test users → clear Resty profiles
        await this.restyCustomerProfileSelectionRepo.delete({
          phone_number: hashedPhone,
        });
      } else {
        // rest for all other user except test users.
        customer.otp_code = null;
        customer.otp_expires_at = null;
      }

      await this.customerRepo.save(customer);

      // Give signup & phone points if first login
      if (customer.login_count === 1) {
        await this.rewardPoints(customer, 'Signup Points');
        await this.rewardPoints(customer, 'Additional Points for Phone');
      }

      // Fetch QR code
      const qr = await this.qrCodeRepo.findOne({
        where: { customer: { id: customer.id } },
      });
      const qrUrl = qr?.qr_code_url;

      // Helper: common result object
      const buildResult = () => ({
        customer_id: customer.uuid,
        tenant_id: customer.tenant?.uuid || customer.tenant.uuid,
        business_unit_id:
          customer.business_unit?.uuid || customer.business_unit.uuid,
        qr_code_url: qrUrl,
        is_new_user: customer.is_new_user,
      });

      // Handle Resty profile selection
      const localProfile = await this.restyCustomerProfileSelectionRepo.findOne(
        {
          where: { phone_number: hashedPhone },
        },
      );

      if (!localProfile) {
        const loginInfo = await this.tryWithTimeout(
          () => this.vehicleService.customerLoginInResty(),
          3000,
        );

        if (!loginInfo?.access_token) {
          return { success: true, message: 'Success', result: buildResult() };
        }

        const customerInfoFromResty = await this.tryWithTimeout(
          () =>
            this.vehicleService.getCustomerInfoFromResty({
              customer,
              loginInfo,
            }),
          3000,
        );

        // Defensive: no profiles
        if (
          !Array.isArray(customerInfoFromResty) ||
          customerInfoFromResty.length === 0
        ) {
          await this.saveRestyProfile(
            hashedPhone,
            [],
            {
              customer_id: customer.uuid,
              customer_name: customer.name,
              email: customer.email,
              mobile: decrypt(customer.hashed_number),
            },
            ProfileSelectionStatus.SELECTED,
          );
          return { success: true, message: 'Success', result: buildResult() };
        }

        // Save multiple or single profiles
        if (customerInfoFromResty.length > 1) {
          await this.saveRestyProfile(
            hashedPhone,
            customerInfoFromResty,
            null,
            ProfileSelectionStatus.PENDING,
          );
          return {
            success: true,
            message: 'Success',
            result: { ...buildResult(), customers: customerInfoFromResty },
          };
        } else {
          await this.saveRestyProfile(
            hashedPhone,
            customerInfoFromResty,
            customerInfoFromResty[0],
            ProfileSelectionStatus.SELECTED,
          );
          return { success: true, message: 'Success', result: buildResult() };
        }
      }

      // Already exists
      if (localProfile.status === ProfileSelectionStatus.PENDING) {
        return {
          success: true,
          message: 'Success',
          result: { ...buildResult(), customers: localProfile.all_profiles },
        };
      }

      return { success: true, message: 'Success', result: buildResult() };
    } catch (error) {
      return {
        success: false,
        message: error?.message || 'Failed',
        result: null,
      };
    }
  }

  /**
   * Reward points for customer and log result
   */
  async rewardPoints(customer: Customer, event: string) {
    const payload = {
      customer_id: customer.uuid,
      event,
      tenantId: String(customer.tenant.id),
      BUId: String(customer.business_unit.id),
    };

    try {
      const earnedPoints = await this.customerService.earnWithEvent(payload);
      await this.logRepo.save(
        this.logRepo.create({
          requestBody: JSON.stringify(payload),
          responseBody: JSON.stringify(earnedPoints),
          url: event,
          method: 'POST',
          statusCode: 200,
        } as Log),
      );
    } catch (err) {
      await this.logRepo.save(
        this.logRepo.create({
          requestBody: JSON.stringify(payload),
          responseBody: JSON.stringify(err),
          url: event,
          method: 'POST',
          statusCode: 200,
        } as Log),
      );
    }
  }

  /**
   * Run a promise with timeout (ms)
   */
  private async tryWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number,
  ): Promise<T | null> {
    try {
      return await Promise.race([
        fn(),
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), timeout),
        ),
      ]);
    } catch {
      return null;
    }
  }

  /**
   * Save Resty profile selection record
   */
  private async saveRestyProfile(
    phone_number: string,
    all_profiles: any[],
    selected_profile: any,
    status: ProfileSelectionStatus,
  ) {
    const now = new Date();
    const data = this.restyCustomerProfileSelectionRepo.create({
      phone_number,
      all_profiles,
      selected_profile,
      status,
      created_at: now,
      updated_at: now,
    });
    await this.restyCustomerProfileSelectionRepo.save(data);
  }

  async saveSelectedProfile(
    phone_number: string,
    selected_profile: Record<string, any>,
  ): Promise<any> {
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

      // Get loginInfo from Resty
      const loginInfo = await this.tryWithTimeout(
        () => this.vehicleService.customerLoginInResty(),
        3000,
      );

      if (!loginInfo?.access_token) {
        throw new BadRequestException('Failed to get Resty login info');
      }

      // Extract all customer_ids from all_profiles
      const allProfiles = Array.isArray(localCustomerInRestyTable.all_profiles)
        ? localCustomerInRestyTable.all_profiles
        : [];

      const customerIds = allProfiles
        .map((p: any) => p?.customer_id)
        .filter((id: string) => !!id);

      // Prepare merge payload
      const mergePayload = {
        customermaster_id: selected_profile.customer_id, // use selected profile as master
        customer_id: customerIds, // all IDs
      };

      // Call Resty merge API
      const response = await this.vehicleService.postToResty(
        '/customer/merge',
        mergePayload,
        loginInfo,
      );

      if (!response || response.error) {
        throw new BadRequestException(
          response?.error || 'Failed to merge customer profiles in Resty',
        );
      }

      // Update local DB after successful merge
      localCustomerInRestyTable.selected_profile = selected_profile;
      localCustomerInRestyTable.status = ProfileSelectionStatus.SELECTED;
      localCustomerInRestyTable.updated_at = new Date();

      await this.restyCustomerProfileSelectionRepo.save(
        localCustomerInRestyTable,
      );

      return {
        success: true,
        message: 'Profile merged and saved successfully',
        result: response,
      };
    } catch (error) {
      return {
        success: false,
        message: error?.message || 'Failed to save/merge profile selection',
        result: null,
      };
    }
  }
}
