import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from './entities/customer.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly repo: Repository<Customer>,
  ) {}

  async create(dto: CreateCustomerDto) {
    const customer = this.repo.create(dto);
    return await this.repo.save(customer);
  }

  async findAll() {
    return await this.repo.find();
  }

  async findOne(id: number) {
    return await this.repo.findOne({ where: { id } });
  }

  async update(id: number, dto: UpdateCustomerDto) {
    await this.repo.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: number) {
    return await this.repo.delete(id);
  }
}
