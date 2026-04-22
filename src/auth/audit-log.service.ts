import { Injectable } from '@nestjs/common';
import { AuthEventType, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(event: {
    type: AuthEventType;
    userId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    try {
      await this.prisma.authEvent.create({
        data: {
          type: event.type,
          userId: event.userId ?? null,
          ip: event.ip ?? null,
          userAgent: event.userAgent ?? null,
          metadata: (event.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch {
    }
  }
}

