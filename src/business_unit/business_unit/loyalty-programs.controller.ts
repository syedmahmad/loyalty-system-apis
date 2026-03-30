import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessUnit } from '../entities/business_unit.entity';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { Customer } from 'src/customers/entities/customer.entity';
import { TenantApiTokenGuard } from 'src/tenants/guards/tenant-api-token.guard';
import { encrypt } from 'src/helpers/encryption';

@Controller('loyalty/programs')
export class LoyaltyProgramsController {
  constructor(
    @InjectRepository(BusinessUnit)
    private readonly buRepo: Repository<BusinessUnit>,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
  ) {}

  @UseGuards(TenantApiTokenGuard)
  @Get()
  async getPrograms(
    @Req() req: any,
    @Query('customer_phone') customerPhone?: string,
  ) {
    const tenantId: number = req.loyaltyTenantId;

    // Resolve customer from phone if provided
    let customerId: number | null = null;
    if (customerPhone) {
      const normalizedPhone = '+' + customerPhone.replace(/^[\s+]+/, '');
      const hashedPhone = encrypt(normalizedPhone);
      const customer = await this.customerRepo.findOne({
        where: { hashed_number: hashedPhone },
        select: ['id'],
      });
      customerId = customer?.id ?? null;
    }

    const businessUnits = await this.buRepo.find({
      where: { status: 1, tenant_id: tenantId },
    });

    const programs = await Promise.all(
      businessUnits
        .filter((bu) => bu.name !== 'All Business Unit')
        .map(async (bu) => {
          // TODO: in future, will add another if we some some different type for Alfursan
          if (bu.type === 'otp') {
            return {
              name: bu.name,
              description: bu.description,
              type: 'otp',
              points: null,
            };
          }

          // points type — fetch wallet balance if customer resolved
          let points: number | null = null;
          if (customerId) {
            const wallet = await this.walletRepo.findOne({
              where: {
                customer: { id: customerId },
                business_unit: { id: bu.id },
              },
            });
            points = wallet?.available_balance ?? null;
          }

          return {
            name: bu.name,
            description: bu.description,
            type: 'points',
            points,
          };
        }),
    );

    return { programs };
  }
}
