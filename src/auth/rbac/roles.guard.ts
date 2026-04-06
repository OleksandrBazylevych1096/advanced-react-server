import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

const rank: Record<string, number> = {
  user: 1,
  moderator: 2,
  admin: 3,
  superadmin: 4,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const req = context.switchToHttp().getRequest();
    const userRoles: string[] = Array.isArray(req.user?.roles) ? req.user.roles : [];
    if (!userRoles.length) return false;
    const maxUserRank = Math.max(...userRoles.map((r) => rank[r] ?? 0));
    return required.some((role) => maxUserRank >= (rank[role] ?? 999));
  }
}

