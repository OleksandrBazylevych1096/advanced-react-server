import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  it('allows moderator route access for admin role entries loaded from Prisma relations', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['moderator']),
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            roles: [{ role: { name: 'ADMIN' } }],
          },
        }),
      }),
    } as any;

    expect(guard.canActivate(context)).toBe(true);
  });
});
