/* eslint-disable @typescript-eslint/no-unused-vars */
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
import { OpenAIService } from 'src/openai/openai/openai.service';
import { TierLocalEntity } from '../entities/tier-local.entity';

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
    private readonly openaiService: OpenAIService,
  ) {}

  async create(
    dto: CreateTierDto,
    user: string,
    permission: any,
  ): Promise<Tier> {
    if (!permission.canCreateTiers) {
      throw new BadRequestException(
        "You don't have permission to access tiers",
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    queryRunner.data = { user };

    try {
      const { locales, id, ...rest } = dto;
      const tierToSave = this.tiersRepository.create({
        ...(id && { id }),
        ...rest,
        locales: locales?.map((locale) => ({
          name: locale.name,
          description: locale.description,
          benefits: locale.benefits || [],
          language: { id: locale.languageId },
        })) as any,
      });
      const savedTier = await this.tiersRepository.save(tierToSave);
      await queryRunner.commitTransaction();
      return savedTier;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(
    client_id: number,
    name: string,
    userId: number,
    bu: number,
    permission: any,
    langCode = 'en',
  ) {
    if (!permission.canViewTiers) {
      throw new BadRequestException(
        "You don't have permission to access tiers",
      );
    }
    // const ruleTargets = await this.ruleTargetRepository.find({
    //   where: { target_type: 'tier' },
    //   relations: { rule: true },
    // });

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found against user-token');
    }

    const privileges: any[] = user.user_privileges || [];

    const tenant = await this.tenantRepository.findOne({
      where: { id: client_id },
    });
    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    const tenantName = tenant.name;

    const isSuperAdmin = privileges.some((p: any) => p.name === 'all_tenants');

    const hasGlobalBusinessUnitAccess = privileges.some(
      (p) =>
        (p.module === 'businessUnits' &&
          p.name === `${tenantName}_All Business Unit`) ||
        (p.module === 'tenants' && p.name !== 'all_tenants'),
    );

    // Base query
    const queryBuilder = this.tiersRepository
      .createQueryBuilder('tier')
      .leftJoinAndSelect('tier.business_unit', 'business_unit')
      .leftJoinAndSelect(
        'tier.locales',
        'locale',
        'locale.language_id IS NOT NULL',
      )
      .leftJoinAndSelect('locale.language', 'language')
      .where('tier.status = :status', { status: 1 })
      .andWhere('tier.tenant_id = :tenant_id', { tenant_id: client_id })
      .orderBy('tier.created_at', 'DESC');

    if (langCode) {
      queryBuilder.andWhere('language.code = :langCode', { langCode });
    }

    if (name) {
      queryBuilder.andWhere(`locale.name LIKE :name`, {
        name: `%${name.trim()}%`,
      });
    }

    if (bu) {
      queryBuilder.andWhere('tier.business_unit_id = :bu', { bu });
    }

    // Case 1: Super Admin or Global Access
    if (hasGlobalBusinessUnitAccess || isSuperAdmin) {
      const tiers = await queryBuilder.getMany();
      return {
        tiers: tiers.map((tier) => ({
          ...tier,
        })),
      };
    }

    // Case 2: Limited Access (specific business units)
    const accessibleBusinessUnitNames = privileges
      .filter(
        (p) =>
          p.module === 'businessUnits' &&
          p.name.startsWith(`${tenantName}_`) &&
          p.name !== `${tenantName}_All Business Unit`,
      )
      .map((p) => p.name.replace(`${tenantName}_`, ''));

    if (!accessibleBusinessUnitNames.length) {
      return { tiers: [] };
    }

    const businessUnits = await this.businessUnitRepository
      .createQueryBuilder('bu')
      .where('bu.status = :status', { status: 1 })
      .andWhere('bu.tenant_id = :tenant_id', { tenant_id: client_id })
      .andWhere('bu.name IN (:...names)', {
        names: accessibleBusinessUnitNames,
      })
      .getMany();

    const availableBusinessUnitIds = businessUnits.map((b) => b.id);

    if (!availableBusinessUnitIds.length) {
      return { tiers: [] };
    }

    if (!bu) {
      queryBuilder.andWhere('tier.business_unit_id IN (:...buIds)', {
        buIds: availableBusinessUnitIds,
      });
    }

    const specificTiers = await queryBuilder.getMany();

    return {
      tiers: specificTiers.map((tier) => ({
        ...tier,
      })),
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

    return {
      ...tier,
      // rule_targets,
    };
  }

  async update(
    id: number,
    dto: UpdateTierDto,
    user: string,
    permission: any,
  ): Promise<Tier> {
    if (!permission.canEditTiers) {
      throw new BadRequestException(
        "You don't have permission to access tiers",
      );
    }
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

  async remove(
    id: number,
    user: string,
    permission: any,
  ): Promise<{ deleted: boolean }> {
    if (!permission.canDeleteTiers) {
      throw new BadRequestException(
        "You don't have permission to access tiers",
      );
    }
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

  async getAllTierBenefits(client_id: string, language_code = 'en') {
    const tenant = await this.tenantRepository.findOne({
      where: { uuid: client_id, status: 1 },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const query = this.tiersRepository
      .createQueryBuilder('tier')
      .leftJoinAndSelect('tier.locales', 'locale')
      .leftJoinAndSelect('locale.language', 'language')
      .where('tier.tenant_id = :tenant_id', { tenant_id: tenant.id })
      .andWhere('tier.status = :status', { status: 1 })
      .orderBy('tier.created_at', 'DESC');

    if (language_code) {
      query.andWhere('language.code = :language_code', { language_code });
    }

    const tiers = await query.getMany();

    return tiers.map((tier) => ({
      tier_id: tier.id,
      tier_name: tier?.locales?.[0]?.name,
      benefits: tier?.locales?.[0]?.benefits || [],
    }));
  }

  async getCurrentCustomerTier(
    customerId: number,
    language_code: string = 'en',
  ) {
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
    const query = this.tiersRepository
      .createQueryBuilder('tier')
      .leftJoinAndSelect('tier.locales', 'locale')
      .leftJoinAndSelect('locale.language', 'language')
      .where('tier.min_points <= :points', { points })
      .andWhere('tier.status = :status', { status: 1 })
      .andWhere('tier.business_unit_id = :business_unit_id', {
        business_unit_id: customerWallet.business_unit?.id,
      })
      .orderBy('tier.min_points', 'DESC');

    if (language_code) {
      query.andWhere('language.code = :language_code', { language_code });
    }

    const matchingTier = await query.getOne();

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
        name: matchingTier?.locales?.[0]?.name,
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
      const { customerId, tenantId, BUId, language_code } = body;
      const customer = await this.customerRepo.findOne({
        where: {
          uuid: customerId,
          business_unit: { id: parseInt(BUId) },
          status: 1,
        },
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

      const customerTierInfo = await this.getCurrentCustomerTier(
        customer.id,
        language_code,
      );

      const query = this.tiersRepository
        .createQueryBuilder('tier')
        .leftJoinAndSelect('tier.locales', 'locale')
        .leftJoinAndSelect('locale.language', 'language')
        .where('tier.tenant_id = :tenantId', { tenantId })
        .andWhere('tier.business_unit_id = :BUId', { BUId: parseInt(BUId) })
        .andWhere('tier.status = :status', { status: 1 })
        .orderBy('tier.min_points', 'ASC');

      if (language_code) {
        query.andWhere('language.code = :language_code', { language_code });
      }
      const allTiers = await query.getMany();

      if (allTiers.length == 0)
        throw new NotFoundException('Tier not found for this customer');

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
                name: next?.locales?.[0]?.name,
                level: next.level,
                min_points: next.min_points,
              }
            : null;
        }

        tiersArr.push({
          uuid: eachTier.uuid,
          name: eachTier?.locales?.[0]?.name,
          level: eachTier.level,
          min_points: eachTier.min_points,
        });

        const benefitsArr = eachTier?.locales?.[0]?.benefits;
        if (!benefitsArr || !Array.isArray(benefitsArr)) continue;

        if (eachTier?.locales?.[0]?.name !== 'Bronze') {
          for (let bindex = 0; bindex <= benefitsArr.length - 1; bindex++) {
            const eachBenefit: any = eachTier?.locales?.[0]?.benefits[bindex];
            if (!eachBenefit) {
              continue;
            }

            const filtered = {
              [`name_${language_code}`]: eachBenefit[`name_${language_code}`],
              icon: eachBenefit.icon,
            };

            if (typeof eachBenefit === 'object' && eachBenefit !== null) {
              benefits.push({
                tierId: eachTier.uuid,
                isUsed: false,
                ...filtered,
              });
            }
          }
        }
      }

      // ✅ Handle case where user doesn’t fall into any tier
      if (!nextTier && wallet.total_balance < allTiers[0]?.min_points) {
        const firstTier = allTiers[0];
        nextTier = {
          uuid: firstTier.uuid,
          name: firstTier?.locales?.[0]?.name,
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
      const { ...restTier } = currentTier;

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
          currentTier: {
            ...restTier,
            name: restTier.name,
          },
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
