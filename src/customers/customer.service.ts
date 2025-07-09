import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BulkCreateCustomerDto } from './dto/create-customer.dto';
import { Request } from 'express';
import { Customer } from './entities/customer.entity';

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
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

      const customer = this.customerRepo.create({
        ...customerDto,
        DOB: new Date(customerDto.DOB),
        business_unit: businessUnit,
      });

      const saved = await this.customerRepo.save(customer);

      results.push({
        status: 'created',
        customer: saved,
      });
    }

    return results;
  }
}
