import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';

import { CurrencyListDto } from './dto/currency.dto';
import { CurrencyEntity } from './entities/currency.entity';
import { CurrencyDataProvider } from './utils/currency-data.provider';

@Injectable()
export class CurrencyService {
  constructor(
    @InjectRepository(CurrencyEntity)
    private readonly currencyRepository: Repository<CurrencyEntity>,
    private readonly currencyDataProvider: CurrencyDataProvider,
  ) {}

  async findByIds(ids: string[]) {
    return this.currencyRepository.find({
      where: { id: In(ids) },
    });
  }

  async getCurrencies(query: CurrencyListDto) {
    const { page, limit, search } = query;
    const queryBuilder = this.currencyRepository.createQueryBuilder('currency');

    if (search) {
      queryBuilder.andWhere({ name: Like(`%${search}%`) });
    }

    queryBuilder.orderBy('currency.name', 'ASC');

    if (page && limit) {
      const skip = (page - 1) * limit;
      queryBuilder.skip(skip).take(limit);
    }

    const [currencies, total] = await queryBuilder.getManyAndCount();

    return {
      currencies,
      total,
      page,
      limit,
    };
  }

  async sync() {
    try {
      const currencyData = this.currencyDataProvider.getCurrencyData();
      const insertResult = await this.currencyRepository.upsert(
        currencyData.map(
          (currency: {
            name: string;
            code: string;
            symbol: string;
            flag?: string;
          }) => ({
            name: currency.name,
            code: currency.code,
            symbol: currency.symbol,
            flag: currency.flag,
          }),
        ),
        ['code'],
      );

      return {
        message: 'Currencies synced successfully',
        insertedCount: insertResult.identifiers.length,
        updatedCount: insertResult.raw.length - insertResult.identifiers.length,
      };
    } catch (error) {
      console.error('Error syncing currencies:', error.message);
      throw error;
    }
  }
}
