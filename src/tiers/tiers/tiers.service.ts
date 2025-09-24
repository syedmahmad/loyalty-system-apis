import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, In, LessThanOrEqual, Repository } from 'typeorm';
import { Tier } from '../entities/tier.entity';
import { CreateTierDto } from '../dto/create-tier.dto';
import { UpdateTierDto } from '../dto/update-tier.dto';
// import { RuleTarget } from '../../rules/entities/rule-target.entity'; // adjust path as needed
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { User } from 'src/users/entities/user.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { OciService } from 'src/oci/oci.service';
import { tierBenefitsDto } from '../dto/tier-benefits.dto';
import { Customer } from 'src/customers/entities/customer.entity';
import { WalletService } from 'src/wallet/wallet/wallet.service';
import { Rule } from 'src/rules/entities/rules.entity';
import { WalletSettings } from 'src/wallet/entities/wallet-settings.entity';
import { WalletTransaction } from 'src/wallet/entities/wallet-transaction.entity';
import * as dayjs from 'dayjs';

@Injectable()
export class TiersService {
  constructor(
    @InjectRepository(Tier)
    private tiersRepository: Repository<Tier>,

    // @InjectRepository(RuleTarget)
    // private ruleTargetRepository: Repository<RuleTarget>,

    @InjectRepository(BusinessUnit)
    private businessUnitRepository: Repository<BusinessUnit>, // adjust path as needed

    @InjectRepository(Wallet) private walletRepo: Repository<Wallet>,

    @InjectRepository(User)
    private userRepository: Repository<User>,

    @InjectRepository(Rule)
    private rulesRepository: Repository<Rule>,

    @InjectRepository(WalletSettings)
    private readonly walletSettings: Repository<WalletSettings>,

    @InjectRepository(WalletTransaction)
    private readonly txRepo: Repository<WalletTransaction>,

    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,

    @InjectDataSource()
    private readonly dataSource: DataSource,

    private readonly ociService: OciService,

    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,

    private readonly walletService: WalletService,
  ) {}

  async create(dto: CreateTierDto, user: string): Promise<Tier> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    queryRunner.data = { user };

    try {
      // 1. Create and save the Tier
      const tier = this.tiersRepository.create({
        ...dto,
        status: 1,
      }); // Default to active status

      tier.benefits = dto.benefits;
      const savedTier = await queryRunner.manager.save(tier);

      // 2. Optionally create RuleTarget records
      // if (dto.rule_targets?.length) {
      //   const createdBy = dto.created_by || user;

      //   const targets = dto.rule_targets.map((rt) =>
      //     this.ruleTargetRepository.create({
      //       rule_id: rt.rule_id,
      //       target_type: 'tier',
      //       target_id: savedTier.id,
      //       created_by: createdBy,
      //       updated_by: createdBy,
      //     }),
      //   );

      //   await queryRunner.manager.save(targets);
      // }

      await queryRunner.commitTransaction();
      return savedTier;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(client_id: number, name: string, userId: number, bu: number) {
    // const ruleTargets = await this.ruleTargetRepository.find({
    //   where: { target_type: 'tier' },
    //   relations: { rule: true },
    // });

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found against user-token');
    }

    const privileges: any[] = user.user_privileges || [];

    // get tenant name from DB (we'll need this to match privileges like `NATC_Service Center`)
    const tenant = await this.tenantRepository.findOne({
      where: { id: client_id },
    });

    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    const tenantName = tenant.name;

    const isSuperAdmin = privileges.some((p: any) => p.name === 'all_tenants');

    // check for global business unit access for this tenant
    const hasGlobalBusinessUnitAccess = privileges.some(
      (p) =>
        p.module === 'businessUnits' &&
        p.name === `${tenantName}_All Business Unit`,
    );

    let optionalWhereClause = {};

    if (name) {
      optionalWhereClause = {
        name: ILike(`%${name}%`),
      };
    }

    if (hasGlobalBusinessUnitAccess || isSuperAdmin) {
      const tiers = await this.tiersRepository.find({
        where: {
          tenant_id: client_id,
          status: 1,
          ...(bu ? { business_unit_id: bu } : {}),
          ...optionalWhereClause,
        },
        relations: { business_unit: true },
        order: { created_at: 'DESC' },
      });

      return {
        tiers: tiers.map((tier) => {
          // const targets = ruleTargets
          //   .filter((rt) => rt.target_id === tier.id)
          //   .map((rt) => ({
          //     id: rt.id,
          //     rule_id: rt.rule_id,
          //   }));
          return {
            ...tier,
            benefits: tier.benefits,
            // rule_targets: targets
          };
        }),
      };
    }

    // if no global access, extract specific tier names from privileges
    const accessibleBusinessUnitNames = privileges
      .filter(
        (p) =>
          p.module === 'businessUnits' &&
          p.name.startsWith(`${tenantName}_`) &&
          p.name !== `${tenantName}_All Business Unit`,
      )
      .map((p) => p.name.replace(`${tenantName}_`, ''));

    if (!accessibleBusinessUnitNames.length) {
      return []; // No access
    }

    const businessUnits = await this.businessUnitRepository.find({
      where: {
        status: 1,
        tenant_id: client_id,
        name: In(accessibleBusinessUnitNames),
      },
    });

    const availableBusinessUnitIds = businessUnits.map((unit) => unit.id);

    const specificTiers = await this.tiersRepository.find({
      where: {
        // business_unit_id: In(availableBusinessUnitIds),
        ...(bu
          ? { business_unit_id: bu }
          : { business_unit_id: In(availableBusinessUnitIds) }), // 👈 handle bu filter
        status: 1,
        tenant_id: client_id,
        ...optionalWhereClause,
      },
      relations: { business_unit: true },
      order: { created_at: 'DESC' },
    });

    return {
      tiers: specificTiers.map((tier) => {
        // const targets = ruleTargets
        //   .filter((rt) => rt.target_id === tier.id)
        //   .map((rt) => ({
        //     id: rt.id,
        //     rule_id: rt.rule_id,
        //   }));

        return {
          ...tier,
          benefits: tier.benefits,
          // rule_targets: targets
        };
      }),
    };
  }

  async findByTenantAndBusinessUnit(tenantId: string, businessUnitId: string) {
    // Find the tenant by uuid to get its id
    const tenant = await this.tenantRepository.findOne({
      where: { uuid: tenantId, status: 1 },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Find the business unit by uuid and tenant by uuid
    const businessUnit = await this.businessUnitRepository.findOne({
      where: { uuid: businessUnitId, tenant_id: tenant.id, status: 1 },
    });

    if (!businessUnit) {
      throw new NotFoundException('Business Unit not found');
    }

    const whereClause: any = {
      tenant_id: tenant.id,
      business_unit_id: businessUnit.id,
      status: 1,
    };

    // Only select the fields you actually need from the tiers, and do not include the business_unit relation
    const tiers = await this.tiersRepository.find({
      where: whereClause,
      select: [
        'uuid',
        'name',
        'name_ar',
        'benefits',
        'status',
        // add any other fields you actually need here
      ],
      order: { created_at: 'DESC' },
    });

    return tiers;
  }

  // async findByBusinessUnit(businessUnitId: string) {
  //   const businessUnit = await this.businessUnitRepository.findOne({
  //     where: { uuid: businessUnitId, status: 1 },
  //   });

  //   if (!businessUnit) {
  //     throw new NotFoundException('Business Unit not found');
  //   }

  //   const client_id = businessUnit.tenant_id;
  //   const business_unit_id = businessUnit.id;

  //   const ruleTargets = await this.ruleTargetRepository.find({
  //     where: { target_type: 'tier' },
  //     relations: { rule: true },
  //   });

  //   const whereClause: any = {
  //     tenant_id: client_id,
  //     business_unit_id,
  //     status: 1,
  //   };

  //   const tiers = await this.tiersRepository.find({
  //     where: whereClause,
  //     relations: { business_unit: true },
  //     order: { created_at: 'DESC' },
  //   });

  //   return {
  //     tiers: tiers.map((tier) => {
  //       const targets = ruleTargets
  //         .filter((rt) => rt.target_id === tier.id)
  //         .map((rt) => ({
  //           id: rt.id,
  //           rule_id: rt.rule_id,
  //         }));
  //       return { ...tier, rule_targets: targets };
  //     }),
  //   };
  // }

  async findOne(id: number) {
    const tier = await this.tiersRepository.findOne({
      where: { id },
      relations: { business_unit: true },
      order: { created_at: 'DESC' },
    });

    if (!tier) throw new NotFoundException('Tier not found');

    // const ruleTargets = await this.ruleTargetRepository.find({
    //   where: {
    //     target_type: 'tier',
    //     target_id: id,
    //   },
    //   relations: { rule: true },
    // });

    // const rule_targets = ruleTargets.map((rt) => ({
    //   id: rt.id,
    //   rule_id: rt.rule_id,
    // }));

    const benefits = tier.benefits;
    return {
      ...tier,
      benefits,
      // rule_targets,
    };
  }

  async update(id: number, dto: UpdateTierDto, user: string): Promise<Tier> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    queryRunner.data = { user };

    try {
      const tier = await queryRunner.manager.findOne(Tier, {
        where: { id },
        relations: ['business_unit'],
      });

      if (!tier) {
        throw new NotFoundException(`Tier with id ${id} not found`);
      }

      if (
        dto.business_unit_id &&
        dto.business_unit_id !== tier.business_unit?.id
      ) {
        const bu = await queryRunner.manager.findOne(BusinessUnit, {
          where: { id: dto.business_unit_id },
        });

        if (!bu) {
          throw new NotFoundException('Business Unit not found');
        }

        tier.business_unit = bu;
      }

      tier.benefits = dto.benefits;
      Object.assign(tier, dto);
      const updatedTier = await queryRunner.manager.save(tier);

      // Optional RuleTargets
      // if (dto.rule_targets) {
      //   // Remove old rule_targets
      //   await queryRunner.manager.delete(this.ruleTargetRepository.target, {
      //     target_type: 'tier',
      //     target_id: id,
      //   });

      //   if (dto.rule_targets.length > 0) {
      //     const updatedBy = dto.updated_by || user;
      //     const newTargets = dto.rule_targets.map((rt) =>
      //       this.ruleTargetRepository.create({
      //         rule_id: rt.rule_id,
      //         target_type: 'tier',
      //         target_id: id,
      //         created_by: updatedBy,
      //         updated_by: updatedBy,
      //       }),
      //     );
      //     await queryRunner.manager.save(newTargets);
      //   }
      // }

      await queryRunner.commitTransaction();
      return updatedTier;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(id: number, user: string): Promise<{ deleted: boolean }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    queryRunner.data = { user };

    try {
      const tier = await queryRunner.manager.findOne(Tier, { where: { id } });
      if (!tier) throw new NotFoundException(`Tier with id ${id} not found`);

      tier.status = 0; // 👈 Soft delete by setting status to 0
      await queryRunner.manager.save(tier);

      await queryRunner.commitTransaction();
      return { deleted: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getAllTierBenefits(client_id: string) {
    const tenant = await this.tenantRepository.findOne({
      where: { uuid: client_id, status: 1 },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const tiers = await this.tiersRepository.find({
      where: { tenant_id: tenant.id, status: 1 },
      order: { created_at: 'DESC' },
    });

    return tiers.map((tier) => ({
      tier_id: tier.id,
      tier_name: tier.name,
      benefits: tier.benefits || [], // assuming it's stored as an array or JSON column
    }));
  }

  async getCurrentCustomerTier(customerId: number) {
    // Step 1: Fetch customer's current point balance (assumes you have a Wallet table)
    const customerWallet = await this.walletRepo.findOne({
      where: { customer: { id: customerId } },
      relations: ['customer'],
    });

    if (!customerWallet) {
      throw new NotFoundException('Customer wallet not found');
    }

    const points = customerWallet.total_balance;

    // Step 2: Find the matching tier
    const matchingTier = await this.tiersRepository.findOne({
      where: {
        min_points: LessThanOrEqual(points),
        status: 1,
        business_unit_id: customerWallet.business_unit?.id,
      },
      order: {
        min_points: 'DESC',
      },
    });

    if (!matchingTier) {
      return {
        tier: null,
        message: 'No tier found for current point balance',
      };
    }

    return {
      customer_id: customerId,
      points,
      tier: {
        id: matchingTier.id,
        uuid: matchingTier.uuid,
        name: matchingTier.name,
        name_ar: matchingTier.name_ar,
        level: matchingTier.level,
        min_points: matchingTier.min_points,
      },
    };
  }

  async uploadFile(buffer, bucketName, objectName) {
    return await this.ociService.uploadBufferToOci(
      buffer,
      bucketName,
      objectName,
    );
  }

  async tierBenefits(body: tierBenefitsDto) {
    try {
      const { customerId, tenantId, BUId } = body;
      const customer = await this.customerRepo.findOne({
        where: { uuid: customerId, business_unit: { id: parseInt(BUId) } },
      });

      const burningRule = await this.rulesRepository.findOne({
        where: {
          business_unit_id: parseInt(BUId),
          tenant_id: tenantId,
          rule_type: 'burn',
          status: 1,
        },
      });

      if (!customer) throw new NotFoundException('Customer not found');
      if (customer && customer.status == 0) {
        throw new NotFoundException('Customer is inactive');
      }

      if (customer.status === 3) {
        throw new NotFoundException('Customer is deleted');
      }

      const wallet = await this.walletService.getSingleCustomerWalletInfoById(
        customer.id,
      );
      if (!wallet) throw new NotFoundException("customer's Wallet not found");

      const customerTierInfo = await this.getCurrentCustomerTier(customer.id);

      const allTiers = await this.tiersRepository.find({
        where: {
          tenant_id: tenantId,
          business_unit_id: parseInt(BUId),
          status: 1,
        },
        order: {
          min_points: 'ASC',
        },
      });

      let nextTier = null;
      const benefits = [];
      const tiersArr = [];
      for (let index = 0; index < allTiers.length; index++) {
        const eachTier = allTiers[index];
        if (wallet.total_balance >= eachTier.min_points) {
          const next = allTiers[index + 1] || null;
          nextTier = next
            ? {
                uuid: next.uuid,
                name: next.name,
                name_ar: next.name_ar,
                level: next.level,
                min_points: next.min_points,
              }
            : null;
        }

        tiersArr.push({
          uuid: eachTier.uuid,
          name: eachTier.name,
          name_ar: eachTier.name_ar,
          level: eachTier.level,
          min_points: eachTier.min_points,
        });

        if (eachTier.name !== 'Bronze') {
          for (
            let bindex = 0;
            bindex <= eachTier.benefits.length - 1;
            bindex++
          ) {
            const eachBenefit = eachTier.benefits[bindex];
            if (!eachBenefit) {
              continue;
            }

            if (typeof eachBenefit === 'object' && eachBenefit !== null) {
              benefits.push({
                tierId: eachTier.uuid,
                isUsed: false,
                ...(eachBenefit as {
                  name_en: string;
                  name_ar: string;
                  icon: string;
                }),
              });
            } else {
              benefits.push({
                tierId: eachTier.uuid,
                name_en: String(eachBenefit),
                isUsed: false,
                name_ar: '',
                icon: '',
              });
            }
          }
        }
      }

      // ✅ Handle case where user doesn’t fall into any tier
      if (!nextTier && wallet.total_balance < allTiers[0].min_points) {
        const firstTier = allTiers[0];
        nextTier = {
          uuid: firstTier.uuid,
          name: firstTier.name,
          name_ar: firstTier.name_ar,
          level: firstTier.level,
          min_points: firstTier?.min_points,
        };
      }

      if (!customerTierInfo || !customerTierInfo.tier) {
        return {
          success: true,
          message: 'Successfully fetched the data!',
          result: {
            points: wallet.available_balance,
            currentTier: null,
            nextTier,
            pointsToNextTier: nextTier
              ? nextTier?.min_points - wallet.total_balance
              : 0,
            tiers: tiersArr,
            benefits,
          },
          errors: [],
        };
      }

      const { id, ...currentTier } = customerTierInfo?.tier;

      const walletSettings = await this.walletSettings.findOne({
        where: {
          business_unit: { id: parseInt(BUId) },
        },
      });

      const lastWalletTransactions = await this.txRepo.findOne({
        where: {
          customer: { id: customer.id },
        },
        order: {
          created_at: 'DESC',
        },
      });

      return {
        success: true,
        message: 'Successfully fetched the data!',
        result: {
          points: customerTierInfo.points,
          points_expiry_date: dayjs(lastWalletTransactions.created_at)
            .add(parseInt(walletSettings?.expiration_value ?? '365'), 'day')
            .toDate(),
          converted_amount:
            (burningRule?.points_conversion_factor
              ? burningRule.points_conversion_factor
              : 0.01) * customerTierInfo.points,
          currentTier: currentTier,
          nextTier,
          pointsToNextTier: nextTier
            ? nextTier.min_points - wallet.total_balance
            : 0,
          tiers: tiersArr,
          benefits,
        },
        errors: [],
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        message: 'Failed to fetch rewards',
        result: null,
        errors: error.message,
      });
    }
  }
}
