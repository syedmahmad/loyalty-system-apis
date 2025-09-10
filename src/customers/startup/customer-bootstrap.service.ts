// coupon_type/startup/coupon-type-bootstrap.service.ts
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Customer } from '../entities/customer.entity';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { WalletSettings } from 'src/wallet/entities/wallet-settings.entity';
import { OciService } from 'src/oci/oci.service';
import { encrypt } from 'src/helpers/encryption';

@Injectable()
export class CustomerBootstrapService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(WalletSettings)
    private readonly walletSettingsRepo: Repository<WalletSettings>,
    private readonly ociService: OciService,
  ) {}

  async onApplicationBootstrap() {
    console.log(
      '/////////////////Encrpting email and phone and adding hash////////////////////////',
    );
    //1. Fetch all customers where hashed_number is null
    const customersNeedingHash = await this.customerRepo.find({
      where: { hashed_number: IsNull() },
    });
    console.log('customersNeedingHash', customersNeedingHash);
    // If there are no customers needing hash, stop further execution
    if (!customersNeedingHash || customersNeedingHash.length === 0) {
      console.log('No customers needing hash. Stopping bootstrap process.');
      return;
    }
    // 2. Prepare array for updated customers
    const updatedCustomers = [];

    // 3. For each customer, generate hashed_number if not present
    for (const customer of customersNeedingHash) {
      const phoneNumber = `${customer.country_code}${customer.phone}`;
      const hashed_number = encrypt(phoneNumber);
      customer.hashed_number = hashed_number;
      updatedCustomers.push(customer);
    }

    // 4. Upsert updated customers (must provide conflict criteria)
    if (updatedCustomers.length > 0) {
      // 'id' is the primary key for Customer
      // For large datasets, process in batches to avoid memory and DB issues
      const BATCH_SIZE = 1000;
      for (let i = 0; i < updatedCustomers.length; i += BATCH_SIZE) {
        const batch = updatedCustomers.slice(i, i + BATCH_SIZE);
        await this.customerRepo.upsert(batch, ['id']);
      }
    }
    console.log(
      '/////////////////Encrpting email and phone and adding hash////////////////////////',
    );
    // const customers = await this.customerRepo.find({
    //   where: {
    //     tenant: { id: IsNull() },
    //   },
    //   relations: ['business_unit', 'business_unit.tenant'],
    // });

    // if (customers) {
    //   for (let index = 0; index <= customers.length - 1; index++) {
    //     const eachCustomer = customers[index];
    //     eachCustomer.tenant = eachCustomer.business_unit.tenant;
    //   }
    //   await this.customerRepo.save(customers);
    // }

    // const wallets = await this.walletRepo.find({
    //   where: {
    //     tenant: { id: IsNull() },
    //   },
    //   relations: ['business_unit', 'business_unit.tenant'],
    // });

    // if (wallets) {
    //   for (let index = 0; index <= wallets.length - 1; index++) {
    //     const eachWallet = wallets[index];
    //     eachWallet.tenant = eachWallet.business_unit.tenant;
    //   }
    //   await this.walletRepo.save(wallets);
    // }

    // const walletSettings = await this.walletSettingsRepo.find({
    //   where: {
    //     tenant: { id: IsNull() },
    //   },
    //   relations: ['business_unit', 'business_unit.tenant'],
    // });

    // if (walletSettings) {
    //   for (let index = 0; index <= walletSettings.length - 1; index++) {
    //     const eachWalletSetting = walletSettings[index];
    //     eachWalletSetting.tenant = eachWalletSetting.business_unit.tenant;
    //   }
    //   await this.walletSettingsRepo.save(walletSettings);
    // }
  }
}
