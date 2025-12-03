import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CAMPAIGNS_ACCESS_KEY } from './campaigns-access.decorator';
import { Repository, In } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { User } from 'src/users/entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class CampaignAccessGuard implements CanActivate {
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
      CAMPAIGNS_ACCESS_KEY,
      context.getHandler(),
    );

    if (!isProtected) return true;

    const request = context.switchToHttp().getRequest();
    const userSecret = request.headers['user-secret'];
    const clientId = request.headers['client_id'];
    const client_id = parseInt(clientId);
    // const client_id =
    //   Number(request.params.client_id) || request.body.tenant_id;

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
    // STEP 1: Global Campaign Permissions
    // -----------------------
    const hasAnyBasicModule = privileges.some(
      (p) => p.module === 'basic_modules',
    );

    const hasCampaignsModule = privileges.some(
      (p) => p.module === 'basic_modules' && p.name === 'campaigns_module',
    );

    const canViewCampaigns =
      hasCampaignsModule &&
      privileges.some(
        (p) => p.module === 'campaigns_module' && p.name === 'view_campaign',
      );
    const canEditCampaigns =
      hasCampaignsModule &&
      privileges.some(
        (p) => p.module === 'campaigns_module' && p.name === 'edit_campaign',
      );
    const canCreateCampaigns =
      hasCampaignsModule &&
      privileges.some(
        (p) => p.module === 'campaigns_module' && p.name === 'create_campaign',
      );
    const canDeleteCampaigns =
      hasCampaignsModule &&
      privileges.some(
        (p) => p.module === 'campaigns_module' && p.name === 'delete_campaign',
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
      if (!hasCampaignsModule) return false;
      if (!canAction && hasTenantOrBUAccess) return false;
      return true;
    };

    const checkAccessForView = determineAccess(canViewCampaigns);
    const checkAccessForEdit = determineAccess(canEditCampaigns);
    const checkAccessForDelete = determineAccess(canDeleteCampaigns);
    const checkAccessForCreate = determineAccess(canCreateCampaigns);

    // -----------------------
    // STEP 4: Attach Permissions to Request
    // -----------------------
    // User can manage Campaigns if they have either:
    // 1) Global Campaign permissions, or
    // 2) Specific tenant/BU access
    request.permission = {
      allowedTenantIds,
      allowedBusinessUnitIds,
      allowAllTenants,
      allowAllBU,
      tenantName,
      canViewCampaigns: canViewCampaigns ? true : checkAccessForView,
      canEditCampaigns: canEditCampaigns ? true : checkAccessForEdit,
      canCreateCampaigns: canCreateCampaigns ? true : checkAccessForCreate,
      canDeleteCampaigns: canDeleteCampaigns ? true : checkAccessForDelete,
    };

    return true;
  }
}
