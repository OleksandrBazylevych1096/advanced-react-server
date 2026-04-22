import { AuthProvider } from '@prisma/client';

export type SessionUser = {
  id: string;
  email?: string;
  phone?: string;
  provider: AuthProvider;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  emailNotificationsEnabled: boolean;
  isTwoFactorEnabled: boolean;
};

export type IssuedAuthTokens = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
};

export type AuthenticatedSessionResponse = {
  user: SessionUser;
  accessToken: string;
  accessTokenExpiresAt: string;
  _refreshToken?: string;
  refreshTokenExpiresAt?: string;
};

export type MfaChallengeResponse = {
  requiresTwoFactor: true;
  mfaToken: string;
  mfaTokenExpiresAt: string;
  availableMethods: Array<'totp' | 'otp_email' | 'otp_sms' | 'backup_code'>;
};

export type AuthResult =
  | {
      user: SessionUser;
      tokens: IssuedAuthTokens;
    }
  | MfaChallengeResponse;

export function isMfaChallengeResponse(
  value: AuthResult | AuthenticatedSessionResponse,
): value is MfaChallengeResponse {
  return 'requiresTwoFactor' in value;
}
