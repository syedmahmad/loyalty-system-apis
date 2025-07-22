import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessUnit } from '../entities/business_unit.entity';

@Injectable()
export class BusinessUnitMiddleware implements NestMiddleware {
  constructor(
    @InjectRepository(BusinessUnit)
    private readonly buRepo: Repository<BusinessUnit>,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const buKey = req.headers['x-business-unit-id'];
    const tenantuuId = req.headers['x-tenant-id'];

    if (!buKey || typeof buKey !== 'string') {
      return res.status(400).json({ message: 'Missing business unit key' });
    }

    const bu = await this.buRepo.findOne({
      where: { uuid: buKey },
      relations: ['tenant'],
    });

    if (!bu) {
      return res.status(403).json({ message: 'Invalid business unit key' });
    }

    if (bu.tenant.uuid !== tenantuuId) {
      return res
        .status(403)
        .json({ message: 'Invalid tenant uuid or tenant uuid is missing' });
    }

    (req as any).businessUnit = bu;
    (req as any).tenant = bu.tenant;
    next();
  }
}
