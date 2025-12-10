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
      // -------- ENGLISH DATA --------
      const response = await firstValueFrom(
        this.httpService.get(
          `${process.env.CENTRAL_API_BASE_URL}/master-data/makes`,
          { params: { languageId: 1 } },
        ),
      );

      const makesEn = (response?.data?.data || []).map(
        ({ MakeId, Make, IsActive = true, Logo }) => ({
          makeId: MakeId,
          name: Make,
          active: Number(IsActive),
          logo: Logo || null,
        }),
      );

      // -------- ARABIC DATA --------
      const responseAr = await firstValueFrom(
        this.httpService.get(
          `${process.env.CENTRAL_API_BASE_URL}/master-data/makes`,
          { params: { languageId: 2 } },
        ),
      );

      const makesAr = (responseAr?.data?.data || []).map(
        ({ MakeId, Make }) => ({
          makeId: MakeId,
          nameAr: Make,
        }),
      );

      // -------- SAVE / UPDATE ENGLISH --------
      for (const make of makesEn) {
        const exist = await this.make.findOne({
          where: { makeId: make.makeId },
        });

        if (exist) {
          await this.make.update(
            { makeId: make.makeId },
            {
              name: make.name,
              active: make.active,
              logo: make.logo,
            },
          );
        } else {
          await this.make.save(make);
        }
      }

      // -------- SAVE / UPDATE ARABIC --------
      for (const make of makesAr) {
        const exist = await this.make.findOne({
          where: { makeId: make.makeId },
        });

        if (exist) {
          await this.make.update(
            { makeId: make.makeId },
            { nameAr: make.nameAr },
          );
        }
      }

      // -------- MARK INACTIVE MAKES --------
      const activeMakeIds = makesEn.map((m) => m.makeId);
      await this.make.update({ makeId: Not(In(activeMakeIds)) }, { active: 0 });

      return {
        success: true,
        message: 'Makes synced successfully',
      };
    } catch (error) {
      console.error('fetchMakesAndSave Error:', error);

      return {
        success: false,
        message: 'Failed to sync makes',
        result: {},
        errors: [error?.message || error],
      };
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
      console.error('getAll Makes Error:', error);
      return {
        success: false,
        message: 'Failed to fetch makes',
        result: {},
        errors: [error?.message || error],
      };
    }
  }
}
