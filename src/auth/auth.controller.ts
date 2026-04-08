import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Req,
  Res,
  BadRequestException,
  Query,
  Delete,
  Param,
  Patch,
  HttpException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { ResendCodeDto } from './dto/resend-code.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { Verify2faDto } from './dto/verify-2fa.dto';
import { Enable2faDto } from './dto/enable-2fa.dto';
import { Disable2faDto } from './dto/disable-2fa.dto';
import { UpdateEmailNotificationsDto } from './dto/update-email-notifications.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import type { Request, Response } from 'express';
import { GoogleOAuthGuard } from './guards/google-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetUserId } from 'src/decorators/get-user-id.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('verify')
  async verifyRegistration(
    @Body() verifyDto: VerifyCodeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } =
      await this.authService.verifyRegistration(verifyDto, req);
    res.cookie(
      'access_token',
      tokens.accessToken,
      this.authService.getAccessCookieOptions(),
    );
    res.cookie(
      'refresh_token',
      tokens.refreshToken,
      this.authService.getRefreshCookieOptions(),
    );
    return this.authService.buildAuthSessionResponse(user, tokens);
  }

  @Post('resend-code')
  async resendVerificationCode(@Body() resendCodeDto: ResendCodeDto) {
    return this.authService.resendVerificationCode(resendCodeDto);
  }

  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const loginResponse = await this.authService.login(loginDto, req);
    if ('requiresTwoFactor' in loginResponse) {
      return loginResponse;
    }
    const { user, tokens } = loginResponse;
    res.cookie(
      'access_token',
      tokens.accessToken,
      this.authService.getAccessCookieOptions(),
    );
    res.cookie(
      'refresh_token',
      tokens.refreshToken,
      this.authService.getRefreshCookieOptions(),
    );
    return this.authService.buildAuthSessionResponse(user, tokens);
  }

  @Post('refresh')
  async refreshTokens(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const incomingRefreshToken = req.cookies?.refresh_token;
    const incomingAccessToken = req.cookies?.access_token;
    try {
      const { user, tokens } = await this.authService.refreshTokens(
        incomingRefreshToken,
        incomingAccessToken,
        req,
      );
      res.cookie(
        'access_token',
        tokens.accessToken,
        this.authService.getAccessCookieOptions(),
      );
      res.cookie(
        'refresh_token',
        tokens.refreshToken,
        this.authService.getRefreshCookieOptions(),
      );
      return this.authService.buildAuthSessionResponse(user, tokens);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 401) {
        res.clearCookie(
          'access_token',
          this.authService.getAccessCookieOptions(),
        );
        res.clearCookie(
          'refresh_token',
          this.authService.getRefreshCookieOptions(),
        );
      }
      throw error;
    }
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const incomingRefreshToken = req.cookies?.refresh_token;
    await this.authService.logout(incomingRefreshToken);
    res.clearCookie('access_token', this.authService.getAccessCookieOptions());
    res.clearCookie(
      'refresh_token',
      this.authService.getRefreshCookieOptions(),
    );
    return { success: true };
  }

  @Get('google')
  @UseGuards(GoogleOAuthGuard)
  async googleAuth() {}

  @Get('google/callback')
  @UseGuards(GoogleOAuthGuard)
  async googleAuthCallback(@Req() req: any, @Res() res: Response) {
    try {
      const code = await this.authService.handleGoogleLogin(req.user);
      const payload = await this.authService.verifyGoogleCode(code, req);
      const params = new URLSearchParams();

      if ('requiresTwoFactor' in (payload as any)) {
        const challenge = payload as any;
        params.set('requiresTwoFactor', 'true');
        params.set('mfaToken', challenge.mfaToken);
        params.set('mfaTokenExpiresAt', challenge.mfaTokenExpiresAt);
        for (const method of challenge.availableMethods ?? []) {
          params.append('availableMethods', method);
        }
      } else {
        const { user, tokens } = payload as any;
        res.cookie(
          'access_token',
          tokens.accessToken,
          this.authService.getAccessCookieOptions(),
        );
        res.cookie(
          'refresh_token',
          tokens.refreshToken,
          this.authService.getRefreshCookieOptions(),
        );

        const session = this.authService.buildAuthSessionResponse(user, tokens);
        params.set('accessToken', session.accessToken);
        params.set('accessTokenExpiresAt', session.accessTokenExpiresAt);
      }

      res.redirect(
        this.buildFrontendOAuthRedirectUrl(params),
      );
    } catch (error) {
      res.redirect(
        this.buildFrontendOAuthRedirectUrl(
          new URLSearchParams({ error: 'GOOGLE_AUTH_FAILED' }),
        ),
      );
    }
  }

  @Get('google/verify')
  async verifyGoogleCode(
    @Query('code') code: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!code) {
      throw new BadRequestException({ code: 'CODE_REQUIRED' });
    }

    const payload = await this.authService.verifyGoogleCode(code, req);
    if ('requiresTwoFactor' in (payload as any)) {
      return payload;
    }
    const { user, tokens } = payload as any;
    res.cookie(
      'access_token',
      tokens.accessToken,
      this.authService.getAccessCookieOptions(),
    );
    res.cookie(
      'refresh_token',
      tokens.refreshToken,
      this.authService.getRefreshCookieOptions(),
    );
    return this.authService.buildAuthSessionResponse(user, tokens);
  }

  @Post('otp/send')
  async sendOtp(@Body() dto: SendOtpDto, @Req() req: Request) {
    return this.authService.sendOtpCompat(dto, req);
  }

  @Post('otp/verify')
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.authService.verifyOtpCompat(dto, req);
    if ('accessToken' in (data as any) && 'user' in (data as any)) {
      const session = data as any;
      res.cookie(
        'access_token',
        session.accessToken,
        this.authService.getAccessCookieOptions(),
      );
      if (session._refreshToken) {
        res.cookie(
          'refresh_token',
          session._refreshToken,
          this.authService.getRefreshCookieOptions(),
        );
      }
      delete session._refreshToken;
    }
    return data;
  }

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  async setupTwoFactor() {
    return this.authService.setupTwoFactorCompat();
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  async enableTwoFactor(
    @GetUserId() userId: string,
    @Body() _dto: Enable2faDto,
  ) {
    return this.authService.enableTwoFactorCompat(userId);
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  async disableTwoFactor(
    @GetUserId() userId: string,
    @Body() _dto: Disable2faDto,
  ) {
    return this.authService.disableTwoFactorCompat(userId);
  }

  @Post('2fa/verify')
  async verifyTwoFactor(
    @Body() dto: Verify2faDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.verifyTwoFactorCompat(dto, req);
    const response = session as any;
    res.cookie(
      'access_token',
      response.accessToken,
      this.authService.getAccessCookieOptions(),
    );
    if (response._refreshToken) {
      res.cookie(
        'refresh_token',
        response._refreshToken,
        this.authService.getRefreshCookieOptions(),
      );
      delete response._refreshToken;
    }
    return response;
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  async getSessions(@GetUserId() userId: string, @Req() req: Request) {
    return this.authService.listSessionsCompat(userId, req.cookies?.refresh_token);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  async revokeSession(@GetUserId() userId: string, @Param('id') id: string) {
    return this.authService.revokeSessionCompat(userId, id);
  }

  @Delete('sessions')
  @UseGuards(JwtAuthGuard)
  async revokeSessions(
    @GetUserId() userId: string,
    @Req() req: Request,
    @Query('includeCurrent') includeCurrent?: string,
  ) {
    return this.authService.revokeAllSessionsCompat(
      userId,
      includeCurrent === 'true',
      req.cookies?.refresh_token,
    );
  }

  @Delete('google/link')
  @UseGuards(JwtAuthGuard)
  async unlinkGoogle(@GetUserId() userId: string) {
    return this.authService.unlinkGoogleCompat(userId);
  }

  @Patch('notifications/email')
  @UseGuards(JwtAuthGuard)
  async updateEmailNotifications(
    @GetUserId() userId: string,
    @Body() dto: UpdateEmailNotificationsDto,
  ) {
    return this.authService.updateEmailNotificationsCompat(userId, dto.enabled);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPasswordCompat(dto.identifier);
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPasswordCompat(dto.token, dto.newPassword);
  }

  private buildFrontendOAuthRedirectUrl(params: URLSearchParams): string {
    const frontendBase = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
    const oauthPath = process.env.FRONTEND_OAUTH_PATH || '/oauth';
    const normalizedPath = oauthPath.startsWith('/')
      ? oauthPath
      : `/${oauthPath}`;
    return `${frontendBase}${normalizedPath}?${params.toString()}`;
  }
}
