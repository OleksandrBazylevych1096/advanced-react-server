import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_ACCESS_TTL_SECONDS,
  DEFAULT_MFA_TTL_SECONDS,
  DEFAULT_REFRESH_TTL_SECONDS,
} from './auth.constants';
import { randomTokenBytes, sha256Hex } from './utils/crypto.util';
import { v4 as uuidv4 } from 'uuid';
import { IssuedAuthTokens } from './auth.types';

type AccessPayload = {
  sub: string;
  roles: string[];
  sessionId: string;
  tokenType: 'access';
};

type MfaPayload = {
  sub: string;
  challengeId: string;
  methods: string[];
  tokenType: 'mfa';
};

type RefreshPayload = {
  sub: string;
  jti: string;
  tokenType: 'refresh';
};

type ScopedPayload<Scope extends string> = {
  sub: string;
  scope: Scope;
};

@Injectable()
export class AuthTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private isProduction() {
    return (this.configService.get<string>('NODE_ENV') || 'development') === 'production';
  }

  private getSecret(primaryKey: string, legacyKey?: string, fallback?: string): string {
    const primary = this.configService.get<string>(primaryKey);
    if (primary) {
      return primary;
    }

    const legacy = legacyKey ? this.configService.get<string>(legacyKey) : undefined;
    if (legacy) {
      return legacy;
    }

    if (!this.isProduction() && fallback) {
      return fallback;
    }

    throw new Error(`Missing required auth secret: ${primaryKey}`);
  }

  getAccessSecret() {
    return this.getSecret('JWT_ACCESS_SECRET', 'JWT_SECRET', 'dev-access-secret');
  }

  getRefreshSecret() {
    return this.getSecret('JWT_REFRESH_SECRET', 'JWT_SECRET', 'dev-refresh-secret');
  }

  getMfaSecret() {
    return this.getSecret('JWT_MFA_SECRET', 'JWT_SECRET', 'dev-mfa-secret');
  }

  getFlowSecret() {
    return this.getSecret('JWT_FLOW_SECRET', 'JWT_SECRET', 'dev-flow-secret');
  }

  getChallengeSecret() {
    return this.getSecret('JWT_CHALLENGE_SECRET', 'JWT_SECRET', 'dev-challenge-secret');
  }

  getPasswordResetSecret() {
    return this.getSecret(
      'PASSWORD_RESET_SECRET',
      'JWT_SECRET',
      'dev-password-reset-secret',
    );
  }

  getAccessTtlSeconds(): number {
    return Number(
      this.configService.get<string>('ACCESS_TOKEN_TTL_SECONDS') ||
        DEFAULT_ACCESS_TTL_SECONDS,
    );
  }

  getMfaTtlSeconds(): number {
    return Number(
      this.configService.get<string>('MFA_TOKEN_TTL_SECONDS') ||
        DEFAULT_MFA_TTL_SECONDS,
    );
  }

  getRefreshTtlSeconds(): number {
    return Number(
      this.configService.get<string>('REFRESH_TOKEN_TTL_SECONDS') ||
        DEFAULT_REFRESH_TTL_SECONDS,
    );
  }

  getPasswordResetTtlSeconds(): number {
    return Number(this.configService.get<string>('PASSWORD_RESET_TTL_SECONDS') || 15 * 60);
  }

  issueAccessToken(payload: Omit<AccessPayload, 'tokenType'>) {
    const ttl = this.getAccessTtlSeconds();
    return {
      token: this.jwtService.sign(
        { ...payload, tokenType: 'access' } satisfies AccessPayload,
        { secret: this.getAccessSecret(), expiresIn: ttl },
      ),
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }

  issueRefreshToken(payload: Omit<RefreshPayload, 'tokenType'>) {
    const ttl = this.getRefreshTtlSeconds();
    return {
      token: this.jwtService.sign(
        { ...payload, tokenType: 'refresh' } satisfies RefreshPayload,
        { secret: this.getRefreshSecret(), expiresIn: ttl },
      ),
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }

  issueMfaToken(payload: Omit<MfaPayload, 'tokenType'>) {
    const ttl = this.getMfaTtlSeconds();
    return {
      token: this.jwtService.sign(
        { ...payload, tokenType: 'mfa' } satisfies MfaPayload,
        { secret: this.getMfaSecret(), expiresIn: ttl },
      ),
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }

  issueScopedToken<Scope extends string>(
    payload: ScopedPayload<Scope>,
    options: { secret: string; ttlSeconds: number },
  ) {
    return this.jwtService.sign(payload, {
      secret: options.secret,
      expiresIn: options.ttlSeconds,
    });
  }

  issueAccessAndRefreshTokens(userId: string, sessionId: string, roles: string[]) {
    const jti = uuidv4();
    const access = this.issueAccessToken({ sub: userId, roles, sessionId });
    const refresh = this.issueRefreshToken({ sub: userId, jti });

    return {
      tokens: {
        accessToken: access.token,
        refreshToken: refresh.token,
        accessTokenExpiresAt: access.expiresAt,
        refreshTokenExpiresAt: refresh.expiresAt,
      } satisfies IssuedAuthTokens,
      refreshJti: jti,
      refreshHash: sha256Hex(refresh.token),
    };
  }

  verifyAccessToken(token: string): AccessPayload {
    return this.jwtService.verify(token, { secret: this.getAccessSecret() });
  }

  verifyRefreshToken(token: string): RefreshPayload {
    return this.jwtService.verify(token, { secret: this.getRefreshSecret() });
  }

  verifyMfaToken(token: string): MfaPayload {
    return this.jwtService.verify(token, { secret: this.getMfaSecret() });
  }

  verifyScopedToken<Scope extends string>(token: string, secret: string) {
    return this.jwtService.verify<ScopedPayload<Scope>>(token, { secret });
  }

  decode(token: string) {
    return this.jwtService.decode(token);
  }

  verifyOrUnauthorized<T extends object>(
    token: string,
    secret: string,
    errorCode: string,
  ): T {
    try {
      return this.jwtService.verify<T>(token, { secret });
    } catch {
      throw new UnauthorizedException({ code: errorCode });
    }
  }

  generateOpaqueRefreshToken() {
    const token = randomTokenBytes(16);
    return { token, hash: sha256Hex(token) };
  }
}

