import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(event: {
    type: string;
    userId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    try {
      await this.prisma.authEvent.create({
        data: {
          type: event.type as any,
          userId: event.userId ?? null,
          ip: event.ip ?? null,
          userAgent: event.userAgent ?? null,
          metadata: (event.metadata ?? {}) as any,
        },
      });
    } catch {
      // Avoid auth flow failures if audit insert fails.
    }
  }
}

