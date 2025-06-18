import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantsService } from 'src/tenants/tenants/tenants.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private tenantsService: TenantsService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const host = req.hostname; // e.g. tenant1.yourapp.com
    const tenantDomain = host.split('.')[0]; // simplistic subdomain extraction

    if (!tenantDomain) {
      throw new UnauthorizedException('Tenant domain missing');
    }

    const tenant = await this.tenantsService.findByDomain(tenantDomain);

    if (!tenant) {
      throw new UnauthorizedException('Invalid tenant');
    }

    (req as any).tenant = tenant; // Attach tenant info to request object
    next();
  }
}

/*@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const tenantId = req.header('x-tenant-id');

    if (!tenantId) {
      throw new UnauthorizedException('Tenant not found');
    }

    // Attach tenantId to request for later use
    (req as any).tenantId = parseInt(tenantId);
    next();
  }
}*/
