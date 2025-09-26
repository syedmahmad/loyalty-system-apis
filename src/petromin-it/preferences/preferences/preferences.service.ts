import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from 'src/customers/entities/customer.entity';
import { CustomerPreference } from '../entities/customer-preference.entity';
import {
  PreferencesResponseDto,
  UpdatePreferencesDto,
} from '../dto/update-preferences.dto';

@Injectable()
export class PreferencesService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(CustomerPreference)
    private readonly prefRepo: Repository<CustomerPreference>,
  ) {}

  async ensurePreferenceForCustomer(
    customer: Customer,
  ): Promise<CustomerPreference> {
    let pref = await this.prefRepo.findOne({
      where: { customer: { id: customer.id } },
    });
    if (!pref) {
      pref = this.prefRepo.create({ customer });
      await this.prefRepo.save(pref);
    }
    return pref;
  }

  async getByCustomerUuid(
    customerUuid: string,
  ): Promise<PreferencesResponseDto> {
    const customer = await this.customerRepo.findOne({
      where: { uuid: customerUuid, status: 1 },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    const pref = await this.ensurePreferenceForCustomer(customer);
    return {
      customer_id: customer.uuid,
      email_notification: pref.email_notification,
      whatsapp_notification: pref.whatsapp_notification,
      sms_notification: pref.sms_notification,
      push_notification: pref.push_notification,
      location_access: pref.location_access,
      biometric: pref.biometric,
    };
  }

  async updateByCustomerUuid(
    customerUuid: string,
    dto: UpdatePreferencesDto,
  ): Promise<PreferencesResponseDto> {
    const customer = await this.customerRepo.findOne({
      where: { uuid: customerUuid, status: 1 },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    const pref = await this.ensurePreferenceForCustomer(customer);

    if (dto.email_notification !== undefined)
      pref.email_notification = dto.email_notification;
    if (dto.whatsapp_notification !== undefined)
      pref.whatsapp_notification = dto.whatsapp_notification;
    if (dto.sms_notification !== undefined)
      pref.sms_notification = dto.sms_notification;
    if (dto.push_notification !== undefined)
      pref.push_notification = dto.push_notification;
    if (dto.location_access !== undefined)
      pref.location_access = dto.location_access;
    if (dto.biometric !== undefined) pref.biometric = dto.biometric;

    await this.prefRepo.save(pref);
    return this.getByCustomerUuid(customerUuid);
  }
}
