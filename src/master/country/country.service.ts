import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { Like, Repository } from 'typeorm';

import {
  CountryListDto,
  CountryParamsDto,
  OnboardStatus,
} from './dto/country.dto';

import { CountryEntity } from './entities/country.entity';
import { BaseService } from 'src/core/services/base.service';

@Injectable()
export class CountryService extends BaseService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @InjectRepository(CountryEntity)
    private readonly countryRepository: Repository<CountryEntity>,
  ) {
    super();
  }

  async getCountryByCountryId(countryId: number) {
    return this.countryRepository.findOne({
      where: { countryId },
      relations: ['addressFormat'],
    });
  }

  async findById({ id }: CountryParamsDto) {
    try {
      const country = await this.countryRepository.findOne({ where: { id } });

      if (!country) {
        throw new BadRequestException('Country not found');
      }
      return {
        country,
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  async getCountries(query: CountryListDto) {
    const { page, limit, search, onboardStatus, addressFormat } = query;
    const skip = (page - 1) * limit;

    const queryBuilder = this.countryRepository.createQueryBuilder('country');

    if (onboardStatus) {
      queryBuilder.leftJoin(
        'app_config',
        'config',
        'config.country_id = country.id',
      );

      if (onboardStatus === OnboardStatus.ONBOARDED) {
        queryBuilder.andWhere('config.id IS NOT NULL');
      } else if (onboardStatus === OnboardStatus.NOT_ONBOARDED) {
        queryBuilder.andWhere('config.id IS NULL');
      }
    }

    if (addressFormat) {
      queryBuilder.leftJoinAndSelect('country.addressFormat', 'addressFormat');
    }

    if (search) {
      queryBuilder.andWhere({ name: Like(`%${search}%`) });
    }

    queryBuilder.orderBy('country.name', 'ASC');

    if (page && limit) {
      queryBuilder.skip(skip).take(limit);
    }

    const [countries, total] = await queryBuilder.getManyAndCount();

    return {
      countries,
      total,
      page,
      limit,
    };
  }

  async sync() {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.configService.get<string>('LOCATION_SYNC_BASE_URL')}countries`,
          {
            headers: {
              'X-CSCAPI-KEY': this.configService.get<string>(
                'LOCATION_SYNC_AUTH_SECRET',
              ),
            },
          },
        ),
      );

      const insertResult = await this.countryRepository.upsert(
        response.data.map(
          (country: {
            id: any;
            name: any;
            native: any;
            iso2: any;
            iso3: any;
          }) => ({
            countryId: country.id,
            name: country.name,
            native: country.native,
            iso2: country.iso2,
            iso3: country.iso3,
          }),
        ),
        ['countryId'],
      );

      return {
        message: 'Countries synced successfully',
        insertedCount: insertResult.identifiers.length,
        updatedCount: insertResult.raw.length - insertResult.identifiers.length,
      };
    } catch (error) {
      console.error(
        'Error syncing countries:',
        error.response?.data || error.message,
      );
      throw error;
    }
  }
}
