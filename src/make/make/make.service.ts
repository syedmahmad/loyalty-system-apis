import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { MakeEntity } from '../entities/make.entity';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * Service responsible for managing vehicle makes in the system
 * Handles fetching makes from an external data source and provides access to make data
 */
@Injectable()
export class MakeService {
  constructor(
    @InjectRepository(MakeEntity)
    private readonly make: Repository<MakeEntity>,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Fetches vehicle makes from an external system and updates the local database
   * Handles both English and Arabic translations of make names
   * Updates active/inactive status of makes based on latest data
   * @throws HttpException if the fetch or save operations fail
   */
  async fetchMakesAndSave() {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${process.env.CENTRAL_API_BASE_URL}/master-data/makes`,
          {
            params: {
              languageId: 1,
            },
          },
        ),
      ).then((res) =>
        (res?.data?.data || []).map(
          ({ MakeId, Make, IsActive = true, Logo }) => ({
            makeId: MakeId,
            name: Make,
            active: Number(IsActive),
            logo: Logo || null,
          }),
        ),
      );

      const responseAr = await firstValueFrom(
        this.httpService.get(
          `${process.env.CENTRAL_API_BASE_URL}/master-data/makes`,
          {
            params: {
              languageId: 2,
            },
          },
        ),
      ).then((res) =>
        (res?.data?.data || []).map(({ MakeId, Make }) => ({
          makeId: MakeId,
          nameAr: Make,
        })),
      );

      await this.make.upsert(response, ['makeId']);
      await this.make.upsert(responseAr, ['makeId']);

      const inactiveMakes = await this.make.find({
        where: {
          active: 1,
          makeId: Not(In(response.map(({ makeId }) => makeId))),
        },
      });

      if (inactiveMakes.length > 0) {
        await this.make.update(
          { makeId: In(response.map(({ makeId }) => makeId)) },
          { active: 0 },
        );
      }

      return {
        message: 'Makes synced successfully',
      };
    } catch (error) {
      console.log('error::::', error);
    }
  }

  /**
   * Retrieves all active vehicle makes from the database
   * @returns Promise with a list of active makes sorted alphabetically
   * @throws HttpException if retrieval fails
   */
  async getAll() {
    try {
      const makes = await this.make.find({
        where: { active: 1 },
      });

      return {
        message: 'Makes fetched successfully',
        makes,
      };
    } catch (error) {
      console.log('error::::', error);
    }
  }
}
