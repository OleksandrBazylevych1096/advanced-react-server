import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthTokenService } from './token.service';

describe('AuthTokenService', () => {
  const configValues: Record<string, string | number> = {
    JWT_ACCESS_SECRET: 'access-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    JWT_MFA_SECRET: 'mfa-secret',
    ACCESS_TOKEN_TTL_SECONDS: 900,
    REFRESH_TOKEN_TTL_SECONDS: 86400,
    MFA_TOKEN_TTL_SECONDS: 300,
  };

  const configService = {
    get: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;

  const service = new AuthTokenService(new JwtService(), configService);

  it('issues access and refresh tokens with different secrets', () => {
    const issued = service.issueAccessAndRefreshTokens('user-1', 'session-1', ['admin']);

    const accessPayload = service.verifyAccessToken(issued.tokens.accessToken);
    const refreshPayload = service.verifyRefreshToken(issued.tokens.refreshToken);

    expect(accessPayload.tokenType).toBe('access');
    expect(accessPayload.sessionId).toBe('session-1');
    expect(accessPayload.roles).toEqual(['admin']);
    expect(refreshPayload.tokenType).toBe('refresh');
    expect(refreshPayload.sub).toBe('user-1');
    expect(refreshPayload.jti).toBe(issued.refreshJti);
  });

  it('issues MFA token with dedicated secret', () => {
    const mfa = service.issueMfaToken({
      sub: 'user-1',
      challengeId: 'challenge-1',
      methods: ['totp'],
    });

    const payload = service.verifyMfaToken(mfa.token);
    expect(payload.tokenType).toBe('mfa');
    expect(payload.challengeId).toBe('challenge-1');
    expect(payload.methods).toEqual(['totp']);
  });
});
