import { Injectable, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Session } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from 'src/redis/redis.service';
import { AuthTokenService } from './token.service';
import { DEFAULT_REFRESH_TTL_SECONDS } from './auth.constants';

type SessionMeta = {
  userId: string;
  sessionId: string;
  refreshHash: string;
  ip?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tokenService: AuthTokenService,
  ) {}

  private ttlSeconds() {
    return this.tokenService.getRefreshTtlSeconds() || DEFAULT_REFRESH_TTL_SECONDS;
  }

  private sessKey(sessionId: string) {
    return `sess:${sessionId}`;
  }
  private rtActiveKey(refreshHash: string) {
    return `rt:active:${refreshHash}`;
  }
  private rtUsedKey(refreshHash: string) {
    return `rt:used:${refreshHash}`;
  }

  async createSession(params: {
    userId: string;
    refreshHash: string;
    deviceInfo?: Record<string, unknown>;
    ip?: string | null;
    userAgent?: string | null;
  }) {
    const ttl = this.ttlSeconds();
    const client = this.redis.getClient();
    const normalizedIp = params.ip ?? null;
    const normalizedUserAgent = params.userAgent ?? null;

    let session: Session | null = null;
    // Reuse an active session for the same browser+ip fingerprint
    // so repeated logins from one device do not create duplicates.
    if (normalizedIp && normalizedUserAgent) {
      session = await this.prisma.session.findFirst({
        where: {
          userId: params.userId,
          isActive: true,
          ip: normalizedIp,
          userAgent: normalizedUserAgent,
        },
        orderBy: { lastActivity: 'desc' },
      });
    }

    if (session) {
      const tx = client.multi();
      tx.del(this.rtActiveKey(session.refreshTokenHash));
      tx.set(
        this.rtUsedKey(session.refreshTokenHash),
        JSON.stringify({
          userId: params.userId,
          sessionId: session.id,
          rotatedAt: new Date().toISOString(),
        }),
        'EX',
        ttl,
      );
      tx.set(
        this.rtActiveKey(params.refreshHash),
        JSON.stringify({ userId: params.userId, sessionId: session.id }),
        'EX',
        ttl,
      );
      await tx.exec();

      session = await this.prisma.session.update({
        where: { id: session.id },
        data: {
          refreshTokenHash: params.refreshHash,
          deviceInfo: (params.deviceInfo ?? {}) as any,
          ip: normalizedIp,
          userAgent: normalizedUserAgent,
          lastActivity: new Date(),
        },
      });
    } else {
      session = await this.prisma.session.create({
        data: {
          userId: params.userId,
          refreshTokenHash: params.refreshHash,
          deviceInfo: (params.deviceInfo ?? {}) as any,
          ip: normalizedIp,
          userAgent: normalizedUserAgent,
        },
      });
      await client.set(
        this.rtActiveKey(params.refreshHash),
        JSON.stringify({ userId: params.userId, sessionId: session.id }),
        'EX',
        ttl,
      );
    }

    const meta: SessionMeta = {
      userId: params.userId,
      sessionId: session.id,
      refreshHash: params.refreshHash,
      ip: params.ip,
      userAgent: params.userAgent,
    };
    await client.set(this.sessKey(session.id), JSON.stringify(meta), 'EX', ttl);
    return session;
  }

  async resolveActiveRefresh(refreshHash: string) {
    const raw = await this.redis.getClient().get(this.rtActiveKey(refreshHash));
    if (!raw) return null;
    return JSON.parse(raw) as { userId: string; sessionId: string };
  }

  async isRefreshReuse(refreshHash: string) {
    return !!(await this.redis.getClient().get(this.rtUsedKey(refreshHash)));
  }

  async rotateRefresh(params: {
    oldRefreshHash: string;
    newRefreshHash: string;
    userId: string;
    sessionId: string;
  }) {
    const client = this.redis.getClient();
    const ttl = this.ttlSeconds();
    const activeRaw = await client.get(this.rtActiveKey(params.oldRefreshHash));
    if (!activeRaw) {
      if (await this.isRefreshReuse(params.oldRefreshHash)) {
        throw new ForbiddenException({ code: 'REFRESH_TOKEN_REUSE_DETECTED' });
      }
      throw new UnauthorizedException({ code: 'REFRESH_TOKEN_INVALID' });
    }

    const tx = client.multi();
    tx.del(this.rtActiveKey(params.oldRefreshHash));
    tx.set(
      this.rtUsedKey(params.oldRefreshHash),
      JSON.stringify({
        userId: params.userId,
        sessionId: params.sessionId,
        rotatedAt: new Date().toISOString(),
      }),
      'EX',
      ttl,
    );
    tx.set(
      this.rtActiveKey(params.newRefreshHash),
      JSON.stringify({ userId: params.userId, sessionId: params.sessionId }),
      'EX',
      ttl,
    );
    tx.expire(this.sessKey(params.sessionId), ttl);
    await tx.exec();

    await this.prisma.session.update({
      where: { id: params.sessionId },
      data: {
        refreshTokenHash: params.newRefreshHash,
        lastActivity: new Date(),
      },
    });
  }

  async revokeSession(sessionId: string, reason = 'manual') {
    const client = this.redis.getClient();
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (session) {
      await client.del(this.rtActiveKey(session.refreshTokenHash));
      await client.set(
        this.rtUsedKey(session.refreshTokenHash),
        JSON.stringify({ userId: session.userId, sessionId }),
        'EX',
        this.ttlSeconds(),
      );
      await client.del(this.sessKey(sessionId));
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { isActive: false, revokedAt: new Date(), revokedReason: reason },
      });
    }
  }

  async revokeAllUserSessions(userId: string, exceptSessionId?: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, isActive: true, ...(exceptSessionId ? { NOT: { id: exceptSessionId } } : {}) },
      select: { id: true },
    });
    await Promise.all(sessions.map((s) => this.revokeSession(s.id, 'revoke_all')));
  }

  async listUserSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, isActive: true },
      orderBy: { lastActivity: 'desc' },
    });
  }
}
