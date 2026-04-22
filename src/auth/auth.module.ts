import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserModule } from '../user/user.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { VerificationModule } from '../verification/verification.module';
import { EmailModule } from '../email/email.module';
import { SmsModule } from '../sms/sms.module';
import { AuthTokenService } from './token.service';
import { SessionService } from './session.service';
import { OtpService } from './otp.service';
import { PasswordRecoveryService } from './password-recovery.service';
import { AuditLogService } from './audit-log.service';
import { EMAIL_PROVIDER, SMS_PROVIDER } from './auth.constants';
import { SmtpEmailProviderAdapter } from './providers/smtp-email-provider.adapter';
import { CurrentSmsProviderAdapter } from './providers/current-sms-provider.adapter';
import { AuthCryptoService } from './crypto.service';
import { TwoFactorService } from './two-factor.service';
import { RedisModule } from '../redis/redis.module';
import { AuthMaintenanceService } from './auth-maintenance.service';

@Module({
  imports: [
    UserModule,
    VerificationModule,
    EmailModule,
    SmsModule,
    RedisModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_ACCESS_SECRET') || configService.get('JWT_SECRET'),
        signOptions: {
          expiresIn:
            configService.get('ACCESS_TOKEN_TTL_SECONDS') ||
            configService.get('JWT_ACCESS_EXPIRATION_TIME') ||
            900,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthTokenService,
    SessionService,
    OtpService,
    PasswordRecoveryService,
    AuditLogService,
    AuthMaintenanceService,
    AuthCryptoService,
    TwoFactorService,
    JwtStrategy,
    LocalStrategy,
    GoogleStrategy,
    SmtpEmailProviderAdapter,
    CurrentSmsProviderAdapter,
    {
      provide: EMAIL_PROVIDER,
      useExisting: SmtpEmailProviderAdapter,
    },
    {
      provide: SMS_PROVIDER,
      useExisting: CurrentSmsProviderAdapter,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
