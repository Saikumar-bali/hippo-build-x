import { Injectable, NestMiddleware } from '@nestjs/common';

/**
 * Tenant resolution middleware.
 * Extracts tenant context from the request and attaches it.
 * In production, resolve tenant from JWT token or subdomain.
 */
@Injectable()
export class TenantMiddleware {
  use(req, _res, next) {
    // TODO: Resolve tenant from JWT or subdomain
    req.tenantContext = {
      tenantId: 'dev-tenant',
      schemaName: 'tenant_dev',
      userId: 'dev-user',
      roles: ['admin'],
      permissions: ['*'],
    };

    next();
  }
}
