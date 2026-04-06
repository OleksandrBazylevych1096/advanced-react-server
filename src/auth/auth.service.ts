import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../user/user.service';
import { VerificationService } from '../verification/verification.service';
import * as bcrypt from 'bcrypt';
import type { Request } from 'express';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { ResendCodeDto } from './dto/resend-code.dto';
import { VerificationType, AuthProvider } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private userService: UserService,
    private verificationService: VerificationService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
    const existingUser = await this.userService.findByEmailOrPhone(
      registerDto.email,
      registerDto.phone,
    );

    if (existingUser) {
      throw new BadRequestException({ code: 'USER_ALREADY_EXISTS' });
    }
    const contact = registerDto.email || registerDto.phone;

    if (!contact) {
      throw new BadRequestException({ code: 'CONTACT_REQUIRED' });
    }

    const user = await this.userService.create(registerDto);

    const code = await this.verificationService.createVerificationCode(
      user.id,
      VerificationType.REGISTRATION,
    );

    const isEmail = !!registerDto.email;

    await this.verificationService.sendVerificationCode(contact, code, isEmail);

    return {
      verificationRequired: isEmail ? 'email' : 'phone',
    };
  }

  async googleAuth(googleUser: any) {
    console.log(googleUser);
    let user = await this.prisma.user.findUnique({
      where: { googleId: googleUser.googleId },
    });

    if (!user) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: googleUser.email },
      });

      if (existingUser && existingUser.provider === AuthProvider.LOCAL) {
        throw new BadRequestException({ code: 'EMAIL_TAKEN_LOCAL' });
      }

      user = await this.prisma.user.create({
        data: {
          email: googleUser.email,
          googleId: googleUser.googleId,
          isVerified: true,
          provider: AuthProvider.GOOGLE,
        },
      });
    }

    return user;
  }

  async handleGoogleLogin(googleUser: any): Promise<string> {
    try {
      const user = await this.googleAuth(googleUser);

      const code = await this.verificationService.createVerificationCode(
        user.id,
        VerificationType.GOOGLE_AUTH,
      );

      return code;
    } catch (error) {
      throw new BadRequestException({ code: 'GOOGLE_AUTH_FAILED' });
    }
  }

  async verifyGoogleCode(code: string, req?: Request) {
    console.log(code);
    const verification = await this.prisma.verificationCode.findFirst({
      where: {
        code,
        type: VerificationType.GOOGLE_AUTH,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!verification) {
      throw new BadRequestException({ code: 'GOOGLE_CODE_INVALID' });
    }

    await this.prisma.verificationCode.update({
      where: { id: verification.id },
      data: { isUsed: true },
    });

    if ((verification.user as any).isTwoFactorEnabled) {
      return this.buildMfaChallengeResponse(verification.user.id);
    }

    const tokens = await this.issueAndPersistTokens(verification.user.id, undefined, req);

    return {
      user: verification.user,
      tokens,
    };
  }

  async exchangeGoogleCode(code: string) {
    const verification = await this.prisma.verificationCode.findFirst({
      where: {
        code,
        type: VerificationType.GOOGLE_AUTH,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!verification) {
      throw new BadRequestException({ code: 'GOOGLE_CODE_INVALID' });
    }

    await this.prisma.verificationCode.update({
      where: { id: verification.id },
      data: { isUsed: true },
    });

    return {
      user: verification.user,
    };
  }

  async verifyRegistration(verifyCodeDto: VerifyCodeDto, req?: Request) {
    const user = await this.userService.findByEmailOrPhone(
      verifyCodeDto.email,
      verifyCodeDto.phone,
    );

    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    }

    await this.verificationService.verifyCode(
      user.id,
      verifyCodeDto.code,
      VerificationType.REGISTRATION,
    );

    const verifiedUser = await this.userService.verifyUser(user.id);
    const fullUser = await this.userService.findOne(verifiedUser.id);
    if (!fullUser) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    }

    const tokens = await this.issueAndPersistTokens(fullUser.id, undefined, req);

    return {
      user: fullUser,
      tokens,
    };
  }

  async resendVerificationCode(resendCodeDto: ResendCodeDto) {
    const user = await this.userService.findByEmailOrPhone(
      resendCodeDto.email,
      resendCodeDto.phone,
    );

    const contact = resendCodeDto.email || resendCodeDto.phone;

    if (!contact) {
      throw new BadRequestException({ code: 'CONTACT_REQUIRED' });
    }

    if (!user) {
      throw new BadRequestException({ code: 'USER_NOT_FOUND' });
    }

    if (user.isVerified) {
      throw new BadRequestException({ code: 'USER_ALREADY_VERIFIED' });
    }

    if (user.provider === AuthProvider.GOOGLE) {
      throw new BadRequestException({ code: 'GOOGLE_USER_NO_VERIFICATION' });
    }

    const unusedCodesCount = await this.prisma.verificationCode.count({
      where: {
        userId: user.id,
        type: VerificationType.REGISTRATION,
        expiresAt: { gt: new Date() },
      },
    });

    if (unusedCodesCount >= 3) {
      throw new BadRequestException({ code: 'VERIFICATION_TOO_MANY_CODES' });
    }

    const code = await this.verificationService.createVerificationCode(
      user.id,
      VerificationType.REGISTRATION,
    );
    const isEmail = !!resendCodeDto.email;

    await this.verificationService.sendVerificationCode(contact, code, isEmail);

    return;
  }

  async login(loginDto: LoginDto, req?: Request) {
    const user = await this.validateUser(loginDto);

    if (user.provider === AuthProvider.GOOGLE) {
      throw new BadRequestException({ code: 'LOGIN_USE_GOOGLE' });
    }

    if (!user.isVerified) {
      throw new UnauthorizedException({ code: 'ACCOUNT_NOT_VERIFIED' });
    }

    if ((user as any).isTwoFactorEnabled) {
      return this.buildMfaChallengeResponse(user.id);
    }

    const tokens = await this.issueAndPersistTokens(user.id, undefined, req);
    return {
      user,
      tokens,
    };
  }

  async validateUser(loginDto: LoginDto) {
    const identifier =
      loginDto.identifier?.trim() ||
      loginDto.email?.trim() ||
      loginDto.phone?.trim();
    const isEmailIdentifier = identifier?.includes('@') ?? false;

    const user = await this.userService.findByEmailOrPhone(
      loginDto.email || (isEmailIdentifier ? identifier : undefined),
      loginDto.phone || (!isEmailIdentifier ? identifier : undefined),
    );

    if (!user) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }

    if (user.provider === AuthProvider.GOOGLE) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }

    if (!user.password) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }

    return user;
  }

  async refreshTokens(
    refreshToken: string | undefined,
    accessTokenFallback?: string,
    req?: Request,
  ) {
    if (!refreshToken) {
      return this.refreshFromAccessTokenFallback(accessTokenFallback, req);
    }

    try {
      const payload = this.verifyJwtOrUnauthorized<{ sub: string }>(
        refreshToken,
        this.configService.get('JWT_SECRET'),
        'REFRESH_TOKEN_INVALID',
      );

      const user = await this.userService.findOne(payload.sub as string);
      if (!user) {
        throw new UnauthorizedException({ code: 'USER_NOT_FOUND' });
      }
      if (!user.isVerified) {
        throw new UnauthorizedException({ code: 'ACCOUNT_NOT_VERIFIED' });
      }

      const decoded: any = this.jwtService.decode(refreshToken);
      const jti = decoded?.jti as string | undefined;
      if (!jti) {
        throw new UnauthorizedException({ code: 'REFRESH_TOKEN_INVALID' });
      }

      const stored = await this.prisma.refreshToken.findUnique({
        where: { jti },
      });

      if (!stored || stored.userId !== user.id || stored.revokedAt) {
        throw new ForbiddenException({ code: 'REFRESH_TOKEN_REVOKED' });
      }
      if (stored.expiresAt <= new Date()) {
        throw new UnauthorizedException({ code: 'REFRESH_TOKEN_EXPIRED' });
      }
      const presentedHash = this.hashToken(refreshToken);
      if (presentedHash !== stored.tokenHash) {
        throw new ForbiddenException({ code: 'REFRESH_TOKEN_MISMATCH' });
      }

      const newTokens = await this.issueAndPersistTokens(user.id, stored.id, req);

      return {
        user,
        tokens: newTokens,
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException &&
        this.extractErrorCode(error) === 'REFRESH_TOKEN_INVALID'
      ) {
        return this.refreshFromAccessTokenFallback(accessTokenFallback, req);
      }
      throw error;
    }
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    const tokenHash = this.hashToken(refreshToken);
    const relatedSessions = await this.prisma.session.findMany({
      where: { refreshTokenHash: tokenHash, isActive: true },
      select: { id: true },
    });
    const decoded: any = this.jwtService.decode(refreshToken);
    const jti = decoded?.jti as string | undefined;
    if (!jti) return;
    await this.prisma.refreshToken.updateMany({
      where: { jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (relatedSessions.length > 0) {
      await this.prisma.session.updateMany({
        where: { id: { in: relatedSessions.map((session) => session.id) } },
        data: { isActive: false, revokedAt: new Date(), revokedReason: 'logout' },
      });
    }
  }

  buildAuthSessionResponse(user: any, tokens: { accessToken: string }) {
    return {
      user: this.mapUserForSession(user),
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: this.getAccessTokenExpiresAt(tokens.accessToken),
    };
  }

  async sendOtpCompat(payload: {
    purpose: string;
    identifier?: string;
    mfaToken?: string;
    channel?: 'email' | 'sms';
  }) {
    if (
      payload.purpose === 'registration_email_verify' ||
      payload.purpose === 'registration_phone_verify'
    ) {
      const isEmail = payload.purpose === 'registration_email_verify';
      const identifier = payload.identifier?.trim();
      if (!identifier) {
        throw new BadRequestException({ code: 'IDENTIFIER_REQUIRED' });
      }
      await this.resendVerificationCode({
        email: isEmail ? identifier : undefined,
        phone: isEmail ? undefined : identifier,
      });
      return { success: true };
    }

    return { success: true };
  }

  async verifyOtpCompat(payload: {
    purpose: string;
    code: string;
    identifier?: string;
    mfaToken?: string;
    channel?: 'email' | 'sms';
  }, req?: Request) {
    if (
      payload.purpose === 'registration_email_verify' ||
      payload.purpose === 'registration_phone_verify'
    ) {
      const isEmail = payload.purpose === 'registration_email_verify';
      const identifier = payload.identifier?.trim();
      if (!identifier) {
        throw new BadRequestException({ code: 'IDENTIFIER_REQUIRED' });
      }
      await this.verifyRegistration({
        email: isEmail ? identifier : undefined,
        phone: isEmail ? undefined : identifier,
        code: payload.code,
      });
      return { success: true };
    }

    if (payload.purpose === 'login_2fa') {
      if (!payload.mfaToken) {
        throw new BadRequestException({ code: 'MFA_TOKEN_REQUIRED' });
      }
      const decoded = this.verifyJwtOrUnauthorized<{ sub: string }>(
        payload.mfaToken,
        this.configService.get('JWT_SECRET'),
        'MFA_TOKEN_INVALID',
      );
      const user = await this.userService.findOne(decoded.sub as string);
      if (!user) {
        throw new UnauthorizedException({ code: 'USER_NOT_FOUND' });
      }
      const tokens = await this.issueAndPersistTokens(user.id, undefined, req);
      return {
        ...this.buildAuthSessionResponse(user, tokens),
        _refreshToken: tokens.refreshToken,
      };
    }

    return { success: true };
  }

  async verifyTwoFactorCompat(payload: { mfaToken: string; code: string }, req?: Request) {
    const decoded = this.verifyJwtOrUnauthorized<{ sub: string }>(
      payload.mfaToken,
      this.configService.get('JWT_SECRET'),
      'MFA_TOKEN_INVALID',
    );
    const user = await this.userService.findOne(decoded.sub as string);
    if (!user) {
      throw new UnauthorizedException({ code: 'USER_NOT_FOUND' });
    }
    const tokens = await this.issueAndPersistTokens(user.id, undefined, req);
    return {
      ...this.buildAuthSessionResponse(user, tokens),
      _refreshToken: tokens.refreshToken,
    };
  }

  async setupTwoFactorCompat() {
    const backupCodes = Array.from({ length: 8 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase(),
    );
    return {
      qrCodeDataUrl:
        'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=',
      backupCodes,
    };
  }

  async enableTwoFactorCompat(userId: string) {
    const user = await this.userService.findOne(userId);
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    }
    return { success: true };
  }

  async disableTwoFactorCompat(userId: string) {
    const user = await this.userService.findOne(userId);
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    }
    return { success: true };
  }

  async listSessionsCompat(userId: string, currentRefreshToken?: string) {
    const currentHash = currentRefreshToken
      ? this.hashToken(currentRefreshToken)
      : null;
    const sessions = await this.prisma.session.findMany({
      where: { userId, isActive: true },
      orderBy: { lastActivity: 'desc' },
    });

    return sessions.map((session) => ({
      id: session.id,
      userId: session.userId,
      ip: session.ip,
      userAgent: session.userAgent,
      isActive: session.isActive,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.lastActivity.toISOString(),
      lastActivity: session.lastActivity.toISOString(),
      revokedAt: session.revokedAt ? session.revokedAt.toISOString() : null,
      revokedReason: session.revokedReason ?? null,
      isCurrent: currentHash ? session.refreshTokenHash === currentHash : false,
    }));
  }

  async revokeSessionCompat(userId: string, sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId, isActive: true },
      select: { id: true, refreshTokenHash: true },
    });
    if (!session) {
      throw new NotFoundException({ code: 'SESSION_NOT_FOUND' });
    }
    await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: session.id },
        data: { isActive: false, revokedAt: new Date(), revokedReason: 'user_delete' },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, tokenHash: session.refreshTokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { success: true };
  }

  async revokeAllSessionsCompat(
    userId: string,
    includeCurrent = false,
    currentRefreshToken?: string,
  ) {
    const currentHash = currentRefreshToken
      ? this.hashToken(currentRefreshToken)
      : null;
    const where = {
      userId,
      isActive: true,
      ...(includeCurrent || !currentHash
        ? {}
        : {
            refreshTokenHash: {
              not: currentHash,
            },
          }),
    };

    const sessions = await this.prisma.session.findMany({
      where,
      select: { id: true, refreshTokenHash: true },
    });

    if (sessions.length > 0) {
      const refreshHashes = sessions.map((session) => session.refreshTokenHash);
      await this.prisma.$transaction([
        this.prisma.session.updateMany({
          where: { id: { in: sessions.map((session) => session.id) } },
          data: { isActive: false, revokedAt: new Date(), revokedReason: 'revoke_all' },
        }),
        this.prisma.refreshToken.updateMany({
          where: {
            userId,
            revokedAt: null,
            tokenHash: { in: refreshHashes },
          },
          data: { revokedAt: new Date() },
        }),
      ]);
    }

    return { success: true };
  }

  async unlinkGoogleCompat(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        googleId: null,
        provider: AuthProvider.LOCAL,
      },
    });
    return { success: true };
  }

  async updateEmailNotificationsCompat(userId: string, enabled: boolean) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { emailNotificationsEnabled: Boolean(enabled) },
      select: { emailNotificationsEnabled: true },
    });
    return {
      success: true,
      emailNotificationsEnabled: user.emailNotificationsEnabled,
    };
  }

  async forgotPasswordCompat(identifier: string) {
    const normalized = identifier?.trim();
    if (!normalized) {
      throw new BadRequestException({ code: 'IDENTIFIER_REQUIRED' });
    }
    const isEmail = normalized.includes('@');
    const user = await this.userService.findByEmailOrPhone(
      isEmail ? normalized : undefined,
      !isEmail ? normalized : undefined,
    );
    if (!user) {
      return { success: true };
    }

    const token = this.jwtService.sign(
      { sub: user.id, purpose: 'password_reset' },
      {
        secret: this.configService.get('JWT_SECRET'),
        expiresIn: '15m',
      },
    );
    await this.verificationService.sendVerificationCode(normalized, token, isEmail);
    return { success: true };
  }

  async resetPasswordCompat(token: string, newPassword: string) {
    const payload = this.verifyJwtOrUnauthorized<{ sub: string; purpose?: string }>(
      token,
      this.configService.get('JWT_SECRET'),
      'RESET_TOKEN_INVALID',
    );
    if (payload?.purpose !== 'password_reset' || !payload?.sub) {
      throw new UnauthorizedException({ code: 'RESET_TOKEN_INVALID' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: payload.sub as string },
      data: { password: passwordHash },
    });
    return { success: true };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private extractIpFromHeader(headerValue?: string | string[]) {
    if (!headerValue) return null;
    const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const firstIp = raw?.split(',')[0]?.trim();
    return firstIp || null;
  }

  private normalizeIp(ip?: string | null) {
    if (!ip) return null;
    const trimmed = ip.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('::ffff:')) {
      return trimmed.slice('::ffff:'.length);
    }
    return trimmed;
  }

  private resolveRequestMeta(req?: Request) {
    const forwardedIp = this.extractIpFromHeader(req?.headers?.['x-forwarded-for']);
    const realIp = this.extractIpFromHeader(req?.headers?.['x-real-ip']);
    const cloudflareIp = this.extractIpFromHeader(req?.headers?.['cf-connecting-ip']);
    const ip = this.normalizeIp(forwardedIp || realIp || cloudflareIp || req?.ip || null);
    const userAgent = req?.headers?.['user-agent']?.toString() || null;
    return { ip, userAgent };
  }

  private getAccessTokenExpiresAt(accessToken: string): string {
    const decoded = this.jwtService.decode(accessToken) as { exp?: number } | null;
    if (decoded?.exp) {
      return new Date(decoded.exp * 1000).toISOString();
    }
    const fallbackMinutes = 15;
    return new Date(Date.now() + fallbackMinutes * 60 * 1000).toISOString();
  }

  private mapUserForSession(user: any) {
    const isEmailVerified = Boolean(user?.email && user?.isVerified);
    const isPhoneVerified = Boolean(user?.phone && user?.isVerified);
    return {
      id: user.id,
      email: user.email ?? undefined,
      phone: user.phone ?? undefined,
      provider: user.provider ?? AuthProvider.LOCAL,
      isEmailVerified,
      isPhoneVerified,
      emailNotificationsEnabled: (user as any).emailNotificationsEnabled ?? true,
      isTwoFactorEnabled: (user as any).isTwoFactorEnabled ?? false,
    };
  }

  private extractJti(refreshToken: string | undefined): string | null {
    if (!refreshToken) {
      return null;
    }
    try {
      const decoded: any = this.jwtService.decode(refreshToken);
      return decoded?.jti ?? null;
    } catch {
      return null;
    }
  }

  private verifyJwtOrUnauthorized<T extends object>(
    token: string,
    secret: string | undefined,
    errorCode: string,
  ): T {
    try {
      return this.jwtService.verify<T>(token, { secret });
    } catch {
      throw new UnauthorizedException({ code: errorCode });
    }
  }

  private extractErrorCode(error: UnauthorizedException): string | undefined {
    const response = error.getResponse() as
      | { code?: string }
      | string
      | undefined;
    if (typeof response === 'string') {
      return undefined;
    }
    return response?.code;
  }

  private async refreshFromAccessTokenFallback(accessToken?: string, req?: Request) {
    if (!accessToken) {
      throw new UnauthorizedException({ code: 'REFRESH_TOKEN_MISSING' });
    }
    const payload = this.verifyJwtOrUnauthorized<{ sub: string }>(
      accessToken,
      this.configService.get('JWT_SECRET'),
      'REFRESH_TOKEN_INVALID',
    );
    const user = await this.userService.findOne(payload.sub as string);
    if (!user) {
      throw new UnauthorizedException({ code: 'USER_NOT_FOUND' });
    }
    if (!user.isVerified) {
      throw new UnauthorizedException({ code: 'ACCOUNT_NOT_VERIFIED' });
    }

    const tokens = await this.issueAndPersistTokens(user.id, undefined, req);
    return {
      user,
      tokens,
    };
  }

  private buildMfaChallengeResponse(userId: string) {
    const mfaToken = this.jwtService.sign(
      { sub: userId, purpose: 'mfa' },
      {
        secret: this.configService.get('JWT_SECRET'),
        expiresIn: '5m',
      },
    );
    return {
      requiresTwoFactor: true as const,
      mfaToken,
      mfaTokenExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      availableMethods: ['totp', 'otp_email', 'otp_sms', 'backup_code'],
    };
  }

  private generateTokensRaw(userId: string, jti: string) {
    const payload = { sub: userId, jti };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_SECRET'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRATION_TIME'),
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_SECRET'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRATION_TIME'),
    });

    return { accessToken, refreshToken };
  }

  private getRefreshExpiresDate(): Date {
    const refreshExp =
      this.configService.get<string>('JWT_REFRESH_EXPIRATION_TIME') || '7d';
    const match = /^(\d+)([dhm])$/.exec(refreshExp);
    const now = new Date();
    if (!match) {
      now.setDate(now.getDate() + 7);
      return now;
    }
    const value = parseInt(match[1], 10);
    const unit = match[2];
    if (unit === 'd') now.setDate(now.getDate() + value);
    if (unit === 'h') now.setHours(now.getHours() + value);
    if (unit === 'm') now.setMinutes(now.getMinutes() + value);
    return now;
  }

  private async issueAndPersistTokens(
    userId: string,
    revokeTokenId?: string,
    req?: Request,
  ) {
    const jti = uuidv4();
    const tokens = this.generateTokensRaw(userId, jti);
    const tokenHash = this.hashToken(tokens.refreshToken);
    const expiresAt = this.getRefreshExpiresDate();
    const requestMeta = this.resolveRequestMeta(req);

    const created = await this.prisma.refreshToken.create({
      data: {
        userId,
        jti,
        tokenHash,
        expiresAt,
      },
    });

    if (revokeTokenId) {
      await this.prisma.refreshToken.update({
        where: { id: revokeTokenId },
        data: { revokedAt: new Date(), replacedByTokenId: created.id },
      });
    }

    let existingSession: { id: string } | null = null;
    if (requestMeta.ip && requestMeta.userAgent) {
      existingSession = await this.prisma.session.findFirst({
        where: {
          userId,
          isActive: true,
          ip: requestMeta.ip,
          userAgent: requestMeta.userAgent,
        },
        select: { id: true },
        orderBy: { lastActivity: 'desc' },
      });
    }

    if (existingSession) {
      await this.prisma.session.update({
        where: { id: existingSession.id },
        data: {
          refreshTokenHash: tokenHash,
          ip: requestMeta.ip,
          userAgent: requestMeta.userAgent,
          deviceInfo: {
            ip: requestMeta.ip,
            userAgent: requestMeta.userAgent,
          },
          lastActivity: new Date(),
          revokedAt: null,
          revokedReason: null,
          isActive: true,
        },
      });
    } else {
      await this.prisma.session.create({
        data: {
          userId,
          refreshTokenHash: tokenHash,
          ip: requestMeta.ip,
          userAgent: requestMeta.userAgent,
          deviceInfo: {
            ip: requestMeta.ip,
            userAgent: requestMeta.userAgent,
          },
          lastActivity: new Date(),
          isActive: true,
        },
      });
    }

    return tokens;
  }

  getAccessCookieOptions() {
    const isProd = process.env.NODE_ENV === 'production';
    const sameSite = this.getSameSitePolicy();
    const secure = this.getSecureCookieFlag(sameSite, isProd);
    return {
      httpOnly: true,
      secure,
      sameSite,
      path: '/',
      maxAge: 1000 * 60 * 15, // 15 minutes typical
    } as const;
  }

  getRefreshCookieOptions() {
    const isProd = process.env.NODE_ENV === 'production';
    const sameSite = this.getSameSitePolicy();
    const secure = this.getSecureCookieFlag(sameSite, isProd);
    // Align with configured refresh expiry if needed; fallback ~7d
    return {
      httpOnly: true,
      secure,
      sameSite,
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    } as const;
  }

  private getSameSitePolicy(): 'lax' | 'strict' | 'none' {
    const configured = (this.configService.get<string>('COOKIE_SAMESITE') || '')
      .toLowerCase()
      .trim();
    if (configured === 'strict' || configured === 'none') {
      return configured;
    }
    return 'lax';
  }

  private getSecureCookieFlag(
    sameSite: 'lax' | 'strict' | 'none',
    isProd: boolean,
  ): boolean {
    const configured = this.configService.get<string>('COOKIE_SECURE');
    if (configured === 'true') return true;
    if (configured === 'false') return false;
    if (sameSite === 'none') return true;
    return isProd;
  }
}
