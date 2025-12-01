import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { COUPON_ACCESS_KEY } from './coupon-access.decorator';
import { Repository, In } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { User } from 'src/users/entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class CouponAccessGuard implements CanActivate {
  constructor(
    private reflector: Reflector,

    @InjectRepository(Tenant)
    private tenantRepo: Repository<Tenant>,

    @InjectRepository(BusinessUnit)
    private businessUnitRepo: Repository<BusinessUnit>,

    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isProtected = this.reflector.get<boolean>(
      COUPON_ACCESS_KEY,
      context.getHandler(),
    );

    if (!isProtected) return true;

    const request = context.switchToHttp().getRequest();
    const userSecret = request.headers['user-secret'];
    const clientId = request.headers['client_id'];
    const client_id = parseInt(clientId);
    // const client_id =
    // Number(request.params.client_id) || request.body.tenant_id;

    if (!userSecret) {
      throw new BadRequestException('user-secret header missing');
    }

    const decodedUser: any = jwt.decode(userSecret);
    const user = await this.userRepo.findOne({
      where: { id: decodedUser.UserId },
    });

    if (!user) throw new BadRequestException('Invalid user-secret token');

    const privileges = user.user_privileges || [];

    // -----------------------
    // STEP 1: Global Coupon Permissions
    // -----------------------
    const hasAnyBasicModule = privileges.some(
      (p) => p.module === 'basic_modules',
    );

    const hasCouponsModule = privileges.some(
      (p) => p.module === 'basic_modules' && p.name === 'coupons_module',
    );

    const canViewCoupons =
      hasCouponsModule &&
      privileges.some(
        (p) => p.module === 'coupons_module' && p.name === 'view_coupons',
      );
    const canEditCoupons =
      hasCouponsModule &&
      privileges.some(
        (p) => p.module === 'coupons_module' && p.name === 'edit_coupons',
      );
    const canCreateCoupons =
      hasCouponsModule &&
      privileges.some(
        (p) => p.module === 'coupons_module' && p.name === 'create_coupons',
      );
    const canDeleteCoupons =
      hasCouponsModule &&
      privileges.some(
        (p) => p.module === 'coupons_module' && p.name === 'delete_coupons',
      );

    // -----------------------
    // STEP 2: Tenant Access
    // -----------------------
    const allowAllTenants = privileges.some((p) => p.name === 'all_tenants');
    const specificTenantNames = privileges
      .filter((p) => p.module === 'tenants' && p.name !== 'all_tenants')
      .map((p) => p.name);

    let allowedTenantIds: number[] = [];
    if (allowAllTenants) {
      const allTenants = await this.tenantRepo.find();
      allowedTenantIds = allTenants.map((t) => t.id);
    } else if (specificTenantNames.length) {
      const matchedTenants = await this.tenantRepo.find({
        where: { name: In(specificTenantNames) },
      });
      allowedTenantIds = matchedTenants.map((t) => t.id);
    }

    if (!allowedTenantIds.includes(client_id)) {
      throw new ForbiddenException('User has no access to this tenant');
    }

    const tenant = await this.tenantRepo.findOne({ where: { id: client_id } });
    if (!tenant) throw new BadRequestException('Tenant not found');

    const tenantName = tenant.name;

    // -----------------------
    // STEP 3: Business Unit Access
    // -----------------------
    const allowAllBU = privileges.some(
      (p) =>
        p.module === 'businessUnits' &&
        p.name === `${tenantName}_All Business Unit`,
    );

    const specificBU_Names = privileges
      .filter(
        (p) =>
          p.module === 'businessUnits' &&
          p.name.startsWith(`${tenantName}_`) &&
          p.name !== `${tenantName}_All Business Unit`,
      )
      .map((p) => p.name.replace(`${tenantName}_`, ''));

    let allowedBusinessUnitIds: number[] = [];

    if (allowAllBU) {
      const allBU = await this.businessUnitRepo.find({
        where: { tenant_id: client_id, status: 1 },
      });
      allowedBusinessUnitIds = allBU.map((b) => b.id);
    } else if (specificBU_Names.length) {
      const matchedBU = await this.businessUnitRepo.find({
        where: { tenant_id: client_id, name: In(specificBU_Names), status: 1 },
      });
      allowedBusinessUnitIds = matchedBU.map((b) => b.id);
    } else {
      // Tenant access without BU restrictions → allow all BUs
      const allBU = await this.businessUnitRepo.find({
        where: { tenant_id: client_id, status: 1 },
      });
      allowedBusinessUnitIds = allBU.map((b) => b.id);
    }

    if (!allowedBusinessUnitIds.length) {
      throw new ForbiddenException(
        'User has no access to any business units in this tenant',
      );
    }

    const hasTenantOrBUAccess =
      allowedTenantIds.length > 0 || allowedBusinessUnitIds.length > 0;

    // generic helper
    const determineAccess = (canAction: boolean) => {
      if (hasTenantOrBUAccess && !hasAnyBasicModule) return true;
      if (!hasCouponsModule) return false;
      if (!canAction && hasTenantOrBUAccess) return false;
      return true;
    };

    const checkAccessForView = determineAccess(canViewCoupons);
    const checkAccessForEdit = determineAccess(canEditCoupons);
    const checkAccessForDelete = determineAccess(canDeleteCoupons);
    const checkAccessForCreate = determineAccess(canCreateCoupons);

    // -----------------------
    // STEP 4: Attach Permissions to Request
    // -----------------------
    // User can manage coupons if they have either:
    // 1) Global coupon permissions, or
    // 2) Specific tenant/BU access
    request.permission = {
      allowedTenantIds,
      allowedBusinessUnitIds,
      allowAllTenants,
      allowAllBU,
      tenantName,
      canViewCoupons: canViewCoupons ? true : checkAccessForView,
      canEditCoupons: canEditCoupons ? true : checkAccessForEdit,
      canCreateCoupons: canCreateCoupons ? true : checkAccessForCreate,
      canDeleteCoupons: canDeleteCoupons ? true : checkAccessForDelete,
    };

    return true;
  }
}
