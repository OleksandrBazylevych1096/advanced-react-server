import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthMaintenanceService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const intervalMs = this.getCleanupIntervalMs();
    this.timer = setInterval(() => {
      this.cleanupExpiredRecords().catch((error) => {
        this.logger.error(
          'Auth maintenance cleanup failed',
          error instanceof Error ? error.stack : undefined,
        );
      });
    }, intervalMs);

    this.cleanupExpiredRecords().catch((error) => {
      this.logger.warn(
        `Initial auth maintenance cleanup failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    });
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async cleanupExpiredRecords() {
    const now = new Date();
    const sessionRetentionDays = Number(
      this.configService.get('AUTH_SESSION_RETENTION_DAYS') || 30,
    );
    const staleSessionThreshold = new Date(
      now.getTime() - sessionRetentionDays * 24 * 60 * 60 * 1000,
    );

    await this.prisma.$transaction([
      this.prisma.refreshToken.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: staleSessionThreshold } }],
        },
      }),
      this.prisma.verificationCode.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { isUsed: true },
            { blockedAt: { not: null } },
          ],
        },
      }),
      this.prisma.otpCode.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { usedAt: { not: null } },
            { blockedAt: { not: null } },
          ],
        },
      }),
      this.prisma.session.deleteMany({
        where: {
          OR: [
            { isActive: false, revokedAt: { lt: staleSessionThreshold } },
            { isActive: false, lastActivity: { lt: staleSessionThreshold } },
          ],
        },
      }),
    ]);
  }

  private getCleanupIntervalMs() {
    const value = Number(this.configService.get('AUTH_CLEANUP_INTERVAL_MS') || 15 * 60 * 1000);
    return Number.isFinite(value) && value >= 60_000 ? value : 15 * 60 * 1000;
  }
}
