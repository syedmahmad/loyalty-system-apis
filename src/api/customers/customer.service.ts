import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BulkCreateCustomerDto } from './dto/create-customer.dto';
import { Request } from 'express';
import { Customer } from './entities/customer.entity';
import { WalletService } from 'src/wallet/wallet/wallet.service';
import { OciService } from 'src/oci/oci.service';

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    private readonly walletService: WalletService,
    private readonly ociService: OciService,
  ) {}

  async createCustomer(req: Request, dto: BulkCreateCustomerDto) {
    const businessUnit = (req as any).businessUnit;

    if (!businessUnit) {
      throw new BadRequestException('Invalid Business Unit Key');
    }

    const results = [];

    for (const customerDto of dto.customers) {
      const existing = await this.customerRepo.findOne({
        where: {
          external_customer_id: customerDto.external_customer_id,
          business_unit: { id: businessUnit.id },
        },
      });

      if (existing) {
        results.push({
          status: 'exists',
          customer: existing,
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
      });

      const saved = await this.customerRepo.save(customer);

      await this.walletService.createWallet({
        customer_id: saved.id,
        business_unit_id: businessUnit.id,
      });

      results.push({
        status: 'created',
        customer: saved,
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
}
