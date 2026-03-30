import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

/**
 * QitafAuthGuard
 *
 * Protects all Qitaf POS endpoints.
 * Reads the Bearer JWT from the Authorization header, verifies it,
 * and attaches tenantId + partnerId to the request object.
 *
 * Token is generated from the admin panel (POST /qitaf/auth/token)
 * and contains both tenantId and partnerId — no hardcoding needed.
 *
 * How to use in controller:
 *   @UseGuards(QitafAuthGuard)
 *   async myMethod(@Req() req) {
 *     const tenantId  = req.qitafTenantId;
 *     const partnerId = req.qitafPartnerId;
 *   }
 */
@Injectable()
export class QitafAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader: string = request.headers['authorization'] ?? '';

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing Qitaf API token. Add Authorization: Bearer <token> header.',
      );
    }

    const token = authHeader.slice(7); // Remove "Bearer " prefix

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET) as any;

      if (!payload?.tenantId || !payload?.partnerId) {
        throw new UnauthorizedException(
          'Invalid token: missing tenantId or partnerId',
        );
      }

      request.qitafTenantId = payload.tenantId;
      request.qitafPartnerId = payload.partnerId;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired Qitaf API token');
    }
  }
}
