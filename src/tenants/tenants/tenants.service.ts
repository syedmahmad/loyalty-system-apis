import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Tenant } from '../entities/tenant.entity';
import { CreateTenantDto } from '../dto/create-tenant.dto';
import { UpdateTenantDto } from '../dto/update-tenant.dto';
import { User } from 'src/users/entities/user.entity';
import { CountryEntity } from 'src/master/country/entities/country.entity';
import { LanguageEntity } from 'src/master/language/entities/language.entity';
import { CurrencyEntity } from 'src/master/currency/entities/currency.entity';
import { TenantLanguageEntity } from '../entities/tenant-language.entity';
import { TenantCurrencyEntity } from '../entities/tenant-currency.entity';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private tenantsRepository: Repository<Tenant>,

    @InjectRepository(User)
    private userRepository: Repository<User>,

    @InjectRepository(CountryEntity)
    private countryRepository: Repository<CountryEntity>,

    @InjectRepository(LanguageEntity)
    private languageRepository: Repository<LanguageEntity>,

    @InjectRepository(CurrencyEntity)
    private currencyRepository: Repository<CurrencyEntity>,

    @InjectRepository(TenantLanguageEntity)
    private tenantLanguageRepository: Repository<TenantLanguageEntity>,

    @InjectRepository(TenantCurrencyEntity)
    private tenantCurrencyRepository: Repository<TenantCurrencyEntity>,

    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateTenantDto, user: string): Promise<Tenant> {
    const userInfo = await this.userRepository.findOne({
      where: { uuid: user },
    });

    if (!userInfo) {
      throw new BadRequestException('User not found against user-token');
    }

    const privileges: any = userInfo.user_privileges || [];
    const hasGlobalAccess = privileges.some(
      (p: any) => p.name === 'all_tenants',
    );
    if (!hasGlobalAccess) {
      throw new BadRequestException(
        'User does not have permission to create tenants',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    queryRunner.data = { user };

    try {
      const country = await this.countryRepository.findOne({
        where: { id: dto.country_id },
      });

      if (!country) {
        throw new BadRequestException('Invalid country_id');
      }

      const languages = dto.languageIds?.length
        ? await queryRunner.manager.findBy(LanguageEntity, {
            id: In(dto.languageIds),
          })
        : [];

      const currencies = dto.currencyIds?.length
        ? await queryRunner.manager.findBy(CurrencyEntity, {
            id: In(dto.currencyIds),
          })
        : [];

      const tenant = this.tenantsRepository.create({
        ...dto,
        status: 1,
        country,
      }); // Default to active status
      const savedTenant = await queryRunner.manager.save(tenant);

      const tenantLanguage = languages.map((language) =>
        this.tenantLanguageRepository.create({
          tenant: savedTenant,
          language,
        }),
      );

      const tenantCurrency = currencies.map((currency) =>
        this.tenantCurrencyRepository.create({
          tenant: savedTenant,
          currency,
        }),
      );

      await queryRunner.manager.save(TenantLanguageEntity, tenantLanguage);
      await queryRunner.manager.save(TenantCurrencyEntity, tenantCurrency);

      await queryRunner.commitTransaction();
      return savedTenant;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new BadRequestException('User not found against user-token');
    }

    const privileges: any = user.user_privileges || [];

    const tenants = await this.tenantsRepository.find({
      where: { status: 1 },
      relations: [
        'languages',
        'languages.language',
        'currencies',
        'currencies.currency',
      ],
      order: { created_at: 'DESC' },
    });

    const hasGlobalAccess = privileges.some(
      (p: any) => p.name === 'all_tenants',
    );

    if (hasGlobalAccess) {
      return await this.tenantsRepository.find({
        where: { status: 1 },
        relations: [
          'languages',
          'languages.language',
          'currencies',
          'currencies.currency',
        ],
      });
    }

    let matchedTenants: any[] = [];

    if (!hasGlobalAccess) {
      const tenantSpecificAccessNames = privileges
        .filter((p) => p.module === 'tenants' && p.name !== 'all_tenants')
        .map((p) => p.name);

      matchedTenants = tenants.filter((tenant) =>
        tenantSpecificAccessNames.includes(tenant.name),
      );
    }

    return matchedTenants;
  }

  async findOne(id: number) {
    // const tenant = await this.tenantsRepository.findOneBy({ id, status: 1 });
    const tenant = await this.tenantsRepository.findOne({
      where: { id, status: 1 },
      relations: [
        'languages',
        'languages.language',
        'currencies',
        'currencies.currency',
      ],
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async findByDomain(domain: string) {
    const tenant = await this.tenantsRepository.findOneBy({ domain });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async update(
    id: number,
    dto: UpdateTenantDto,
    user: string,
  ): Promise<Tenant> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    queryRunner.data = { user };

    try {
      const tenant = await queryRunner.manager.findOne(Tenant, {
        where: { id },
      });
      if (!tenant) throw new Error(`Tenant with ID ${id} not found`);

      tenant.name = dto.name ?? tenant.name;
      tenant.domain = dto.domain ?? tenant.domain;

      if (dto.country_id) {
        const country = await queryRunner.manager.findOne(CountryEntity, {
          where: { id: dto.country_id },
        });
        if (country) tenant.country = country;
      }

      if (dto.languageIds?.length) {
        await queryRunner.manager.delete(TenantLanguageEntity, {
          tenant_id: tenant.id,
        });
        const tenantLanguages = dto.languageIds.map((languageId) => {
          const entity: any = new TenantLanguageEntity();
          entity.tenant_id = tenant.id;
          entity.language_id = languageId;
          return entity;
        });
        await queryRunner.manager.save(TenantLanguageEntity, tenantLanguages);
      }

      if (dto.currencyIds?.length) {
        await queryRunner.manager.delete(TenantCurrencyEntity, {
          tenant_id: tenant.id,
        });

        const tenantCurrencies = dto.currencyIds.map((currencyId) => {
          const entity = new TenantCurrencyEntity();
          entity.tenant_id = tenant.id;
          entity.currency_id = currencyId;
          return entity;
        });

        await queryRunner.manager.save(TenantCurrencyEntity, tenantCurrencies);
      }

      const updatedTenant = await queryRunner.manager.save(tenant);
      await queryRunner.commitTransaction();
      return updatedTenant;
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
      const tenant = await queryRunner.manager.findOne(Tenant, {
        where: { id },
      });
      if (!tenant) throw new Error(`Tenant with ID ${id} not found`);

      tenant.status = 0; // 👈 Set status to 0 instead of deleting
      await queryRunner.manager.save(tenant);

      await queryRunner.commitTransaction();
      return { deleted: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /*
  private async validatePayload(
    payload: UpdateAppConfigDto | CreateAppConfigDto,
  ): Promise<{
    countryId: string;
    languages: LanguageEntity[];
    currencies: CurrencyEntity[];
  }> {
    const { countryId } = payload;

    const exitingTenantConfig = await this.tenantsRepository.findOne({
      where: { country: { id: countryId } },
    });

    if (exitingTenantConfig) {
      if (payload instanceof UpdateAppConfigDto) {
        if (exitingTenantConfig.id !== payload.id) {
          throw new BadRequestException(
            'App config already exists for this country',
          );
        }
      } else {
        throw new BadRequestException(
          'App config already exists for this country',
        );
      }
    }

    const languages = payload.languageIds.length
      ? await this.languageService.findByIds(payload.languageIds)
      : [];
    if (payload.languageIds?.length && !languages.length) {
      throw new BadRequestException('Some languages not found');
    }

    const currencies = payload.currencyIds.length
      ? await this.currencyService.findByIds(payload.currencyIds)
      : [];
    if (payload.currencyIds?.length && !currencies.length) {
      throw new BadRequestException('Some currencies not found');
    }

    return {
      countryId,
      languages,
      currencies,
    };
  }
    */
}
