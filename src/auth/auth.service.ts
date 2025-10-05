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

    return;
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

  async verifyGoogleCode(code: string) {
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

    const tokens = await this.issueAndPersistTokens(verification.user.id);

    return {
      user: {
        id: verification.user.id,
        email: verification.user.email,
        phone: verification.user.phone,
        isVerified: verification.user.isVerified,
        provider: verification.user.provider,
      },
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

  async verifyRegistration(verifyCodeDto: VerifyCodeDto) {
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

    const tokens = await this.issueAndPersistTokens(verifiedUser.id);

    return {
      user: {
        id: verifiedUser.id,
        email: verifiedUser.email,
        phone: verifiedUser.phone,
        isVerified: verifiedUser.isVerified,
      },
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

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto);

    if (user.provider === AuthProvider.GOOGLE) {
      throw new BadRequestException({ code: 'LOGIN_USE_GOOGLE' });
    }

    if (!user.isVerified) {
      throw new UnauthorizedException({ code: 'ACCOUNT_NOT_VERIFIED' });
    }

    const tokens = await this.issueAndPersistTokens(user.id);
    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        provider: user.provider,
      },
      tokens,
    };
  }

  async validateUser(loginDto: LoginDto) {
    const user = await this.userService.findByEmailOrPhone(
      loginDto.email,
      loginDto.phone,
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

  async refreshTokens(refreshToken: string | undefined) {
    if (!refreshToken) {
      throw new UnauthorizedException({ code: 'REFRESH_TOKEN_MISSING' });
    }

    const payload = this.jwtService.verify(refreshToken, {
      secret: this.configService.get('JWT_SECRET'),
    });

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

    const newTokens = await this.issueAndPersistTokens(user.id, stored.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        provider: user.provider,
      },
      tokens: newTokens,
    };
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    const decoded: any = this.jwtService.decode(refreshToken);
    const jti = decoded?.jti as string | undefined;
    if (!jti) return;
    await this.prisma.refreshToken.updateMany({
      where: { jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
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

  private async issueAndPersistTokens(userId: string, revokeTokenId?: string) {
    const jti = uuidv4();
    const tokens = this.generateTokensRaw(userId, jti);
    const tokenHash = this.hashToken(tokens.refreshToken);
    const expiresAt = this.getRefreshExpiresDate();

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

    return tokens;
  }

  getAccessCookieOptions() {
    const isProd = process.env.NODE_ENV === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      path: '/',
      maxAge: 1000 * 60 * 15, // 15 minutes typical
    } as const;
  }

  getRefreshCookieOptions() {
    const isProd = process.env.NODE_ENV === 'production';
    // Align with configured refresh expiry if needed; fallback ~7d
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    } as const;
  }
}
