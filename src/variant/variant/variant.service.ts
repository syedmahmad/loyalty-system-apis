import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { ModelService } from 'src/model/model/model.service';
import { In, Not, Repository } from 'typeorm';
import { GetVariantsDto } from '../dto/variant.dto';
import { VariantEntity } from '../entities/variant.entity';

/**
 * Service responsible for managing vehicle variants/trims in the system
 * Handles fetching, storing, and retrieving variant information for vehicle models
 * Completes the Make-Year-Model-Variant hierarchy for vehicle data
 */
@Injectable()
export class VariantService {
  constructor(
    @InjectRepository(VariantEntity)
    private readonly variant: Repository<VariantEntity>,
    private readonly httpService: HttpService,
    private readonly modelService: ModelService,
  ) {}

  /**
   * Fetches vehicle variants/trims from an external system and updates the local database
   * Retrieves variants for each model, including multilingual information
   * Updates active/inactive status of variants based on latest data
   * @throws HttpException if the fetch or save operations fail
   */
  async fetchVariantAndSave() {
    try {
      const { models } = await this.modelService.getAll();

      for (const model of models) {
        const [response, responseAr] = await Promise.all([
          firstValueFrom(
            this.httpService.get(
              `${process.env.CENTRAL_API_BASE_URL}/master-data/models/${model.modelId}/trims`,
              {
                params: {
                  languageId: 1,
                },
              },
            ),
          ).then((res) =>
            (res?.data?.data || []).map(
              ({ TrimId, Trim, IsActive, TransmissionTypeId, FuelTypeId }) => ({
                variantId: TrimId,
                model: { id: model.id },
                name: Trim,
                active: Number(IsActive),
                transmission: TransmissionTypeId,
                fuelType: FuelTypeId,
              }),
            ),
          ),
          firstValueFrom(
            this.httpService.get(
              `${process.env.CENTRAL_API_BASE_URL}/master-data/models/${model.modelId}/trims`,
              {
                params: {
                  languageId: 2,
                },
              },
            ),
          ).then((res) =>
            (res?.data?.data || []).map(({ TrimId, Trim }) => ({
              variantId: TrimId,
              nameAr: Trim,
            })),
          ),
        ]);

        await this.variant.upsert(response, ['variantId']);
        await this.variant.upsert(responseAr, {
          conflictPaths: ['variantId'],
          skipUpdateIfNoValuesChanged: true,
        });

        const inactiveVariant = await this.variant.find({
          where: {
            active: 1,
            model: {
              id: model.id,
            },
            variantId: Not(In(response.map(({ variantId }) => variantId))),
          },
        });

        if (inactiveVariant.length > 0) {
          await this.variant.update(
            {
              variantId: In(inactiveVariant.map(({ variantId }) => variantId)),
              model: {
                id: model.id,
              },
            },
            { active: 0 },
          );
        }
      }

      return {
        message: 'Variants synced successfully',
      };
    } catch (error) {
      console.log('Errro:::', error);
    }
  }

  /**
   * Retrieves active variants/trims for specific models with optional filtering
   * Supports multiple model selection and filtering by year, transmission, and fuel type
   * Used in the new MYMV array-based vehicle selection system
   * @param data - Object containing model IDs array and optional filters (years, transmission, fuelType)
   * @returns Promise with an array of active variants for the specified models and filters
   * @throws HttpException if retrieval fails
   */
  async getAll(data: GetVariantsDto) {
    try {
      const queryBuilder = this.variant
        .createQueryBuilder('variant')
        .leftJoinAndSelect('variant.model', 'model')
        .where('variant.active = :isActive', { isActive: 1 })
        .andWhere('model.id IN (:...modelIds)', { modelIds: data.modelIds });

      if (data.years && data.years.length > 0) {
        queryBuilder.andWhere('model.year IN (:...years)', {
          years: data.years,
        });
      }

      if (data.transmission && data.transmission.length > 0) {
        queryBuilder.andWhere('variant.transmission IN (:...transmission)', {
          transmission: data.transmission,
        });
      }

      if (data.fuelType && data.fuelType.length > 0) {
        queryBuilder.andWhere('variant.fuelType IN (:...fuelType)', {
          fuelType: data.fuelType,
        });
      }

      queryBuilder.orderBy('variant.name', 'ASC');
      const variants = await queryBuilder.getMany();

      return {
        message: 'Variants fetched successfully',
        variants,
      };
    } catch (error) {
      console.log('Errro:::', error);
    }
  }
}
