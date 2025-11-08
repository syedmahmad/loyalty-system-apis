import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';

import { LanguageListDto } from './dto/language.dto';
import { LanguageEntity } from './entities/language.entity';
import { LanguageDataProvider } from './utils/language-data.provider';

@Injectable()
export class LanguageService {
  constructor(
    @InjectRepository(LanguageEntity)
    private readonly languageRepository: Repository<LanguageEntity>,
    private readonly languageDataProvider: LanguageDataProvider,
  ) {}

  async findByIds(ids: string[]) {
    return this.languageRepository.find({
      where: { id: In(ids) },
    });
  }

  async getLanguages(query: LanguageListDto) {
    const { page, limit, search } = query;
    const queryBuilder = this.languageRepository.createQueryBuilder('language');

    if (search) {
      queryBuilder.andWhere({ name: Like(`%${search}%`) });
    }

    // queryBuilder.orderBy('language.name', 'ASC');

    if (page && limit) {
      const skip = (page - 1) * limit;
      queryBuilder.skip(skip).take(limit);
    }

    const [languages, total] = await queryBuilder.getManyAndCount();

    return {
      languages,
      total,
      page,
      limit,
    };
  }

  async sync() {
    try {
      const languageData = this.languageDataProvider.getLanguageData();
      const insertResult = await this.languageRepository.upsert(
        languageData.map((language) => ({
          name: language.name,
          code: language.code,
          flag: language.flag,
          priority: language.priority,
        })),
        ['code'],
      );

      return {
        message: 'Languages synced successfully',
        insertedCount: insertResult.identifiers.length,
        updatedCount: insertResult.raw.length - insertResult.identifiers.length,
      };
    } catch (error) {
      console.error('Error syncing languages:', error.message);
      throw error;
    }
  }
}
