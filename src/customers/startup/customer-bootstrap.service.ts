// coupon_type/startup/coupon-type-bootstrap.service.ts
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Customer } from '../entities/customer.entity';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { WalletSettings } from 'src/wallet/entities/wallet-settings.entity';

@Injectable()
export class CustomerBootstrapService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(WalletSettings)
    private readonly walletSettingsRepo: Repository<WalletSettings>,
  ) {}

  async onApplicationBootstrap() {
    const customers = await this.customerRepo.find({
      where: {
        tenant: { id: IsNull() },
      },
      relations: ['business_unit', 'business_unit.tenant'],
    });

    if (customers) {
      for (let index = 0; index <= customers.length - 1; index++) {
        const eachCustomer = customers[index];
        eachCustomer.tenant = eachCustomer.business_unit.tenant;
      }
      await this.customerRepo.save(customers);
    }

    const wallets = await this.walletRepo.find({
      where: {
        tenant: { id: IsNull() },
      },
      relations: ['business_unit', 'business_unit.tenant'],
    });

    if (wallets) {
      for (let index = 0; index <= wallets.length - 1; index++) {
        const eachWallet = wallets[index];
        eachWallet.tenant = eachWallet.business_unit.tenant;
      }
      await this.walletRepo.save(wallets);
    }

    const walletSettings = await this.walletSettingsRepo.find({
      where: {
        tenant: { id: IsNull() },
      },
      relations: ['business_unit', 'business_unit.tenant'],
    });

    if (walletSettings) {
      for (let index = 0; index <= walletSettings.length - 1; index++) {
        const eachWalletSetting = walletSettings[index];
        eachWalletSetting.tenant = eachWalletSetting.business_unit.tenant;
      }
      await this.walletSettingsRepo.save(walletSettings);
    }
  }
}
