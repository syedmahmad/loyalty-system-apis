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

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    private readonly ociService: OciService,
    private readonly customerService: CustomerService,
    @InjectRepository(QrCode)
    private readonly qrCodeRepo: Repository<QrCode>,
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
      await this.customerService.createAndSaveCustomerQrCode(
        customer.uuid,
        customer.id,
      );

      // trigger sms
      await TriggerSMS(encryptedPhone, otp, body.language_code);

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
          business_unit: { id: parseInt(businessUnitId) },
          tenant: { id: parseInt(tenantId) },
        },
        relations: ['business_unit', 'tenant'],
      });

      if (!customer) throw new NotFoundException('Customer not found');
      if (!customer.otp_code || !customer.otp_expires_at)
        throw new BadRequestException('OTP not generated');
      if (String(customer.otp_code) !== String(otp))
        throw new BadRequestException('Invalid OTP');
      if (new Date(customer.otp_expires_at).getTime() < Date.now())
        throw new BadRequestException('OTP Expired');

      customer.otp_code = null;
      customer.otp_expires_at = null;
      await this.customerRepo.save(customer);
      const qr = await this.qrCodeRepo.findOne({
        where: { customer: { id: customer.id } },
      });
      const qrUrl = qr ? `/qrcodes/qr/${qr.short_id}` : null;

      return {
        success: true,
        message: 'Success',
        result: {
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
