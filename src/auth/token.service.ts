import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_ACCESS_TTL_SECONDS,
  DEFAULT_MFA_TTL_SECONDS,
  DEFAULT_REFRESH_TTL_SECONDS,
} from './auth.constants';
import { randomTokenBytes, sha256Hex } from './utils/crypto.util';

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

@Injectable()
export class AuthTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private getAccessSecret() {
    return this.configService.get<string>('JWT_ACCESS_SECRET') || 'dev-access-secret';
  }

  private getMfaSecret() {
    return this.configService.get<string>('JWT_MFA_SECRET') || 'dev-mfa-secret';
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

  verifyAccessToken(token: string): AccessPayload {
    return this.jwtService.verify(token, { secret: this.getAccessSecret() });
  }

  verifyMfaToken(token: string): MfaPayload {
    return this.jwtService.verify(token, { secret: this.getMfaSecret() });
  }

  generateOpaqueRefreshToken() {
    const token = randomTokenBytes(16);
    return { token, hash: sha256Hex(token) };
  }
}

