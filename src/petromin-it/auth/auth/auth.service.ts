import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GetOtpDto, VerifyOtpDto } from 'src/petromin-it/auth/dto/auth.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from 'src/customers/entities/customer.entity';
import { OciService } from 'src/oci/oci.service';
import { v4 as uuidv4 } from 'uuid';
import { CustomerService } from 'src/customers/customer.service';
import { QrCode } from 'src/qr_codes/entities/qr_code.entity';
import { encrypt } from 'src/helpers/encryption';
import { TriggerSMS } from 'src/helpers/triggerSMS';
import { TriggerWhatsapp } from 'src/helpers/triggerWhatsapp';
import { Log } from 'src/logs/entities/log.entity';
import { WalletService } from 'src/wallet/wallet/wallet.service';
import { customAlphabet } from 'nanoid';
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    private readonly ociService: OciService,
    private readonly customerService: CustomerService,
    @InjectRepository(QrCode)
    private readonly qrCodeRepo: Repository<QrCode>,
    @InjectRepository(Log)
    private readonly logRepo: Repository<Log>,
    private readonly walletService: WalletService,
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
          status: 1,
          is_new_user: 1,
          // Use nanoid for unique referral_code generation (Nest.js uses nanoid for unique IDs)
          referral_code: customAlphabet(
            'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
            6,
          ),
        });
      }

      // Generate a 4-digit OTP as a string
      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      // Set OTP expiry time to 5 minutes from now
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      // Assign OTP and expiry to customer entity
      customer.otp_code = otp;
      customer.otp_expires_at = expiresAt;
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
      Promise.all([
        TriggerSMS(encryptedPhone, otp, body.language_code, this.logRepo),
        TriggerWhatsapp(encryptedPhone, otp, body.language_code, this.logRepo),
      ]).catch(() => {
        // Optionally log or handle errors, but don't block the main flow
      });

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

      const { otp, mobileNumber, referral_code } = body;
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
      if (customer && customer.is_new_user) {
        customer.is_new_user = 0;
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

        if (referral_code) {
          const referrer_customer = await this.customerRepo.findOne({
            where: { referral_code: referral_code },
          });
          customer.referrer_id = referrer_customer.id;
          // rewards points to referrer
          const earnReferrerPoints = {
            customer_id: referrer_customer.uuid, // need to give points to referrer
            event: 'Referrer Reward Points', // this is important what if someone changes this event name form Frontend
            tenantId: String(customer.tenant.id),
            BUId: String(customer.business_unit.id),
          };
          try {
            const earnedPoints =
              await this.customerService.earnWithEvent(earnReferrerPoints);
            // log the external call
            const logs = await this.logRepo.create({
              requestBody: JSON.stringify(earnReferrerPoints),
              responseBody: JSON.stringify(earnedPoints),
              url: earnReferrerPoints.event,
              method: 'POST',
              statusCode: 200,
            } as Log);
            await this.logRepo.save(logs);
          } catch (err) {
            const logs = await this.logRepo.create({
              requestBody: JSON.stringify(earnReferrerPoints),
              responseBody: JSON.stringify(err),
              url: earnReferrerPoints.event,
              method: 'POST',
              statusCode: 200,
            } as Log);
            await this.logRepo.save(logs);
          }
        }
      }

      customer.otp_code = null;
      customer.otp_expires_at = null;
      await this.customerRepo.save(customer);
      const qr = await this.qrCodeRepo.findOne({
        where: { customer: { id: customer.id } },
      });
      const qrUrl = qr.qr_code_url;

      return {
        success: true,
        message: 'Success',
        result: {
          customer_id: customer.uuid,
          tenant_id: customer.tenant?.uuid || customer.tenant.uuid,
          business_unit_id:
            customer.business_unit?.uuid || customer.business_unit.uuid,
          qr_code_url: qrUrl,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error?.message || 'Failed',
        result: null,
      };
    }
  }
}
// curl --location PROCESS.ENV.NCMC_COMMUNICATION_ENDPOINT \
// --header 'Authorization: Bearer PROCESS.ENV.NCMC_COMMUNICATION_TOKEN' \
// --header 'Content-Type: application/json' \
// --data '{
//    "template_id": "ad31fd0d-1dc5-4c39-88a2-934fea5b2cd1",
//   "language_code": "en",
//   "to": [
//     {
//       "number": ENCRYPTED_MOBILE_NUMBER,
//       "dynamic_fields": {
//         "otp": "9112"
//       }
//     }
//   ]
// }'
