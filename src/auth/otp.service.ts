import {
  Inject,
  Injectable,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { OtpChannel, OtpPurpose } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { BCRYPT_ROUNDS, EMAIL_PROVIDER, SMS_PROVIDER } from './auth.constants';
import type {
  EmailProvider,
  SmsProvider,
} from './interfaces/notification-provider.interfaces';
import { randomNumericCode } from './utils/crypto.util';
import { RedisService } from 'src/redis/redis.service';

const CHANNEL_MAP: Record<'SMS' | 'EMAIL', OtpChannel> = {
  SMS: 'SMS',
  EMAIL: 'EMAIL',
};

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
  ) {}

  private ttlMinutes = 10;

  private smsRateKey(userId: string) {
    return `otp:sms:last:${userId}`;
  }
  private smsDailyKey(userId: string) {
    return `otp:sms:day:${userId}:${new Date().toISOString().slice(0, 10)}`;
  }

  async sendOtp(params: {
    userId: string;
    channel: 'SMS' | 'EMAIL';
    purpose: OtpPurpose;
    target: string;
  }) {
    if (params.channel === 'SMS') {
      const client = this.redis.getClient();
      const lastSent = await client.get(this.smsRateKey(params.userId));
      if (lastSent) {
        throw new HttpException({ code: 'OTP_SMS_RATE_LIMIT' }, HttpStatus.TOO_MANY_REQUESTS);
      }
      const daily = Number((await client.get(this.smsDailyKey(params.userId))) || 0);
      if (daily >= 5) {
        throw new HttpException(
          { code: 'OTP_SMS_DAILY_LIMIT' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      const tx = client.multi();
      tx.set(this.smsRateKey(params.userId), '1', 'EX', 60);
      tx.incr(this.smsDailyKey(params.userId));
      tx.expire(this.smsDailyKey(params.userId), 60 * 60 * 24);
      await tx.exec();
    }

    const code = randomNumericCode(4);
    const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + this.ttlMinutes * 60 * 1000);

    await this.prisma.otpCode.updateMany({
      where: {
        userId: params.userId,
        channel: CHANNEL_MAP[params.channel],
        purpose: params.purpose,
        usedAt: null,
        blockedAt: null,
      },
      data: { blockedAt: new Date() },
    });

    await this.prisma.otpCode.create({
      data: {
        userId: params.userId,
        channel: CHANNEL_MAP[params.channel],
        purpose: params.purpose,
        codeHash,
        expiresAt,
        deliveryTargetSnapshot: params.target,
      },
    });

    if (params.channel === 'SMS') {
      await this.smsProvider.sendOtp(params.target, code);
    } else {
      await this.emailProvider.sendOtp(params.target, code);
    }
  }

  async verifyOtp(params: {
    userId: string;
    channel: 'SMS' | 'EMAIL';
    purpose: OtpPurpose;
    code: string;
  }) {
    const record = await this.prisma.otpCode.findFirst({
      where: {
        userId: params.userId,
        channel: CHANNEL_MAP[params.channel],
        purpose: params.purpose,
        usedAt: null,
        blockedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!record || record.expiresAt <= new Date()) {
      throw new UnauthorizedException({ code: 'OTP_INVALID_OR_EXPIRED' });
    }
    if (record.attempts >= record.maxAttempts) {
      await this.prisma.otpCode.update({
        where: { id: record.id },
        data: { blockedAt: new Date() },
      });
      throw new UnauthorizedException({ code: 'OTP_ATTEMPTS_EXCEEDED' });
    }

    const ok = await bcrypt.compare(params.code, record.codeHash);
    if (!ok) {
      const attempts = record.attempts + 1;
      await this.prisma.otpCode.update({
        where: { id: record.id },
        data: {
          attempts,
          blockedAt: attempts >= record.maxAttempts ? new Date() : null,
        },
      });
      throw new UnauthorizedException({
        code: attempts >= record.maxAttempts ? 'OTP_ATTEMPTS_EXCEEDED' : 'OTP_INVALID',
      });
    }

    await this.prisma.otpCode.update({
      where: { id: record.id },
      data: { usedAt: new Date(), attempts: { increment: 1 } },
    });
  }
}
