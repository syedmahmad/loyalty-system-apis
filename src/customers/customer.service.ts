import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as QRCode from 'qrcode';
import { Repository } from 'typeorm';
import { BulkCreateCustomerDto } from './dto/create-customer.dto';
import { Request } from 'express';
import { Customer } from './entities/customer.entity';
import { WalletService } from 'src/wallet/wallet/wallet.service';
import { OciService } from 'src/oci/oci.service';
import { v4 as uuidv4 } from 'uuid';
import { nanoid } from 'nanoid';
import { QrCode } from '../qr_codes/entities/qr_code.entity';
import { QrcodesService } from '../qr_codes/qr_codes/qr_codes.service';

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    private readonly walletService: WalletService,
    private readonly ociService: OciService,
    @InjectRepository(QrCode)
    private readonly qrCodeRepo: Repository<QrCode>,
    private readonly qrService: QrcodesService,
  ) {}

  async createCustomer(req: Request, dto: BulkCreateCustomerDto) {
    const businessUnit = (req as any).businessUnit;

    if (!businessUnit) {
      throw new BadRequestException('Invalid Business Unit Key');
    }

    const customerUuid = uuidv4();

    const results = [];
    for (const customerDto of dto.customers) {
      if (!customerDto.phone) {
        results.push({
          status: 'failed',
          message: 'Phone number is required',
        });
        continue;
      }

      const existing = await this.customerRepo.findOne({
        where: {
          external_customer_id: customerDto.external_customer_id,
          business_unit: { id: businessUnit.id },
        },
      });

      if (existing) {
        if (!existing.uuid) {
          existing.uuid = customerUuid;
          await this.customerRepo.save(existing);
        }

        let existCustomerQr = await this.qrService.findOne(existing.id);

        if (!existCustomerQr) {
          existCustomerQr = await this.createAndSaveCustomerQrCode(
            customerUuid,
            existing.id,
          );
        }

        results.push({
          status: 'exists',
          qr_code_url: `/qrcodes/qr/${existCustomerQr.short_id}`,
        });
        continue;
      }

      const encryptedEmail = await this.ociService.encryptData(
        customerDto.email,
      );
      const encryptedPhone = await this.ociService.encryptData(
        customerDto.phone,
      );

      const customer = this.customerRepo.create({
        ...customerDto,
        email: encryptedEmail,
        phone: encryptedPhone,
        DOB: new Date(customerDto.DOB),
        business_unit: businessUnit,
        uuid: customerUuid,
      });
      const saved = await this.customerRepo.save(customer);

      const saveCustomerQrCodeInfo = await this.createAndSaveCustomerQrCode(
        customerUuid,
        saved.id,
      );
      // TODO: need to check existing wallet for customer, his point balance.
      // how to do that,
      // create a new transaction for customer wallet and add reason of adjustment like import form external system
      // and then add points to customer wallet
      await this.walletService.createWallet({
        customer_id: saved.id,
        business_unit_id: businessUnit.id,
      });

      results.push({
        status: 'created',
        // TODO: baseUrl is wrong, we do not allow direct admin API access, all communication should be through gatwway
        qr_code_url: `/qrcodes/qr/${saveCustomerQrCodeInfo.short_id}`,
      });
    }

    return results;
  }

  async getCustomerById(id: number) {
    const customer = await this.customerRepo.findOne({
      where: { id },
    });

    if (!customer) {
      throw new Error(`Customer with ID ${id} not found`);
    }

    return customer;
  }

  async getAllCustomers(search?: string) {
    const query = this.customerRepo
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.business_unit', 'business_unit')
      .leftJoinAndSelect('business_unit.tenant', 'tenant');

    if (search) {
      query.where('customer.name LIKE :search', { search: `%${search}%` });
    }

    return await query.orderBy('customer.created_at', 'DESC').getMany();
  }

  async updateStatus(id: number, status: 0 | 1) {
    const customer = await this.customerRepo.findOne({ where: { id } });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    customer.status = status;
    return this.customerRepo.save(customer);
  }

  async getCustomerByUuid(req: Request, uuid: string) {
    const businessUnit = (req as any).businessUnit;

    if (!businessUnit) {
      throw new BadRequestException('Invalid Business Unit Key');
    }

    const customer = await this.customerRepo.findOne({
      where: { uuid: uuid },
    });

    if (!customer) {
      throw new NotFoundException(`Customer not found`);
    }

    const walletinfo = await this.walletService.getSingleCustomerWalletInfo(
      customer.id,
      businessUnit.id,
    );
    const transactionInfo = await this.walletService.getWalletTransactions(
      walletinfo?.id,
    );
    return {
      total_balance: walletinfo?.total_balance,
      available_balance: walletinfo?.available_balance,
      locked_balance: walletinfo?.locked_balance,
      customer_name: customer.name,
      city: customer.city,
      address: customer.address,
      businessUnit: walletinfo?.business_unit?.name,
      tenant_id: walletinfo?.business_unit?.tenant_id,
      transactions: transactionInfo || [],
    };
  }

  async createAndSaveCustomerQrCode(customerUuid, customerId) {
    const shortId = nanoid(8);
    const customerQrcode = await QRCode?.toDataURL(customerUuid);
    const mapping = this.qrCodeRepo.create({
      customer: { id: customerId },
      short_id: shortId,
      qr_code_base64: customerQrcode,
    });
    return await this.qrCodeRepo.save(mapping);
  }

  async getCustomerWithWalletAndTransactions(
    req: Request,
    customerId: number,
    page: number,
    pageSize: number,
  ) {
    const customer = await this.customerRepo.findOne({
      where: { id: customerId },
    });

    const walletinfo = await this.walletService.getSingleCustomerWalletInfoById(
      customer.id,
    );
    const transactionInfo = await this.walletService.getWalletTransactions(
      walletinfo?.id,
      page,
      pageSize,
    );

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${customerId} not found`);
    }

    return { ...customer, wallet: walletinfo, transactions: transactionInfo };
  }
}
