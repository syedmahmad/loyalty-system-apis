import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MakeService } from 'src/make/make/make.service';
import { In, Not, Repository } from 'typeorm';
import { GetModelsDto, GetYearsDto } from '../dto/model.dto';
import { ModelEntity } from '../entities/model.entity';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';

/**
 * Service responsible for managing vehicle models in the system
 * Handles fetching, storing, and retrieving models along with their year information
 * Works in conjunction with MakeService to maintain a complete vehicle hierarchy
 */
@Injectable()
export class ModelService {
  constructor(
    @InjectRepository(ModelEntity)
    private readonly model: Repository<ModelEntity>,
    private readonly makeService: MakeService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Fetches vehicle models from an external system and updates the local database
   * Retrieves models for each make, including year information and translations
   * Updates active/inactive status of models based on latest data
   * @throws HttpException if the fetch or save operations fail
   */
  async fetchModelAndSave() {
    try {
      const { makes } = await this.makeService.getAll();

      for (const make of makes) {
        const [response, responseAr] = await Promise.all([
          firstValueFrom(
            this.httpService.get(
              `${process.env.CENTRAL_API_BASE_URL}/master-data/${make.makeId}/models`,
              {
                params: {
                  languageId: 1,
                },
              },
            ),
          ).then((res) =>
            (res?.data?.data || []).map(
              ({ ModelId, Model, ModelYear, IsActive = true }) => ({
                modelId: ModelId,
                make: { id: make.id },
                name: Model,
                year: Number(ModelYear),
                active: Number(IsActive),
              }),
            ),
          ),
          firstValueFrom(
            this.httpService.get(
              `${process.env.CENTRAL_API_BASE_URL}/master-data/${make.makeId}/models`,
              {
                params: {
                  languageId: 2,
                },
              },
            ),
          ).then((res) =>
            (res?.data?.data || []).map(({ ModelId, Model, ModelYear }) => ({
              modelId: ModelId,
              nameAr: Model,
              year: Number(ModelYear),
            })),
          ),
        ]);

        await this.model.upsert(response, ['modelId']);
        await this.model.upsert(responseAr, {
          conflictPaths: ['modelId'],
          skipUpdateIfNoValuesChanged: true,
        });

        const inactiveModels = await this.model.find({
          where: {
            make: { id: make.id },
            active: 1,
            modelId: Not(In(response.map(({ modelId }) => modelId))),
          },
        });

        if (inactiveModels.length > 0) {
          await this.model.update(
            {
              modelId: In(inactiveModels.map(({ modelId }) => modelId)),
              make: {
                id: make.id,
              },
            },
            { active: 0 },
          );
        }
      }

      return {
        message: 'Models synced successfully',
      };
    } catch (error) {
      console.log('Error:::', error);
    }
  }

  /**
   * Retrieves all available years for one or more makes
   * Supports multiple make selection for flexible year queries in the new MYMV system
   * @param data - Object containing the make IDs array to filter years by
   * @returns Promise with an array of distinct years available for the specified makes
   * @throws HttpException if retrieval fails
   */
  async getAllYears(data: GetYearsDto) {
    try {
      const queryBuilder = this.model.createQueryBuilder('model');

      queryBuilder
        .select('DISTINCT model.year', 'year')
        .where('model.make_id IN (:...makeIds)', { makeIds: data.makeIds })
        .orderBy('model.year', 'DESC');

      const years = await queryBuilder.getRawMany();

      return {
        message: 'Years fetched successfully',
        years: years.map(({ year }) => year),
        makeIds: data.makeIds,
      };
    } catch (error) {
      console.log('Error:::', error);
    }
  }

  /**
   * Retrieves all active models, optionally filtered by years and makes
   * @param data - Object containing an optional years array and makeIds array to filter models by
   * @returns Promise with an array of active models matching the criteria
   * @throws HttpException if retrieval fails
   */
  async getAll(data?: GetModelsDto) {
    try {
      const queryBuilder = this.model.createQueryBuilder('model');
      queryBuilder.where('model.active = :isActive', { isActive: 1 });

      if (data?.years && data.years.length > 0) {
        queryBuilder.andWhere('model.year IN (:...years)', {
          years: data.years,
        });
      }

      if (data?.makeIds && data.makeIds.length > 0) {
        queryBuilder.andWhere('model.make_id IN (:...makeIds)', {
          makeIds: data.makeIds,
        });
      }

      queryBuilder.orderBy('model.name', 'ASC');
      const models = await queryBuilder.getMany();

      return {
        message: 'Models fetched successfully',
        models,
      };
    } catch (error) {
      console.log('Error:::', error);
    }
  }
}
