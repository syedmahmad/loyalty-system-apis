import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QitafController } from './qitaf.controller';
import { QitafService } from './qitaf.service';
import { TenantPartnerIntegration } from 'src/tenant-integrations/entities/tenant-partner-integration.entity';
import { TenantPartnerTerminal } from 'src/tenant-partner-terminals/entities/tenant-partner-terminal.entity';
import { AuthTokenGuard } from 'src/users/guards/authTokenGuard';
import { User } from 'src/users/entities/user.entity';
import { QitafTransaction } from './entities/qitaf-transaction.entity';
import { Customer } from 'src/customers/entities/customer.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantPartnerIntegration,
      TenantPartnerTerminal,
      User,
      QitafTransaction, // transaction log
      Customer,         // for customer phone lookup in getCustomerTransactions
    ]),
  ],
  controllers: [QitafController],
  providers: [QitafService, AuthTokenGuard],
  exports: [QitafService],
})
export class QitafModule {}
