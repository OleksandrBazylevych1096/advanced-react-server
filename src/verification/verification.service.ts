import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { VerificationType } from '@prisma/client';
import { SmsService } from '../sms/sms.service';
import { v4 as uuidv4 } from 'uuid';
import { randomInt } from 'crypto';

@Injectable()
export class VerificationService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private smsService: SmsService,
  ) {}

  async createVerificationCode(
    userId: string,
    type: VerificationType,
  ): Promise<string> {
    const existingPendingCode = await this.prisma.verificationCode.findFirst({
      where: {
        userId,
        type,
        isUsed: false,
        blockedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (
      existingPendingCode &&
      existingPendingCode.lastSentAt.getTime() > Date.now() - 60 * 1000
    ) {
      throw new BadRequestException({ code: 'VERIFICATION_CODE_RATE_LIMITED' });
    }

    const code = this.generateCode(type);
    const expiresAt = new Date();
    if (type === VerificationType.GOOGLE_AUTH) {
      expiresAt.setMinutes(expiresAt.getMinutes() + 2);
    } else {
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);
    }
    await this.prisma.verificationCode.updateMany({
      where: {
        userId,
        type,
        isUsed: false,
        blockedAt: null,
      },
      data: {
        isUsed: true,
      },
    });
    await this.prisma.verificationCode.create({
      data: {
        userId,
        code,
        type,
        expiresAt,
        maxAttempts: type === VerificationType.GOOGLE_AUTH ? 10 : 5,
        lastSentAt: new Date(),
      },
    });

    return code;
  }

  async verifyCode(
    userId: string,
    code: string,
    type: VerificationType,
  ): Promise<boolean> {
    const verificationCode = await this.prisma.verificationCode.findFirst({
      where: {
        userId,
        code,
        type,
        isUsed: false,
        blockedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!verificationCode) {
      await this.bumpFailedAttempts(userId, type);
      throw new BadRequestException({ code: 'VERIFICATION_CODE_INVALID' });
    }

    if (verificationCode.attempts >= verificationCode.maxAttempts) {
      await this.prisma.verificationCode.update({
        where: { id: verificationCode.id },
        data: { blockedAt: new Date() },
      });
      throw new BadRequestException({ code: 'VERIFICATION_CODE_ATTEMPTS_EXCEEDED' });
    }

    await this.prisma.verificationCode.update({
      where: { id: verificationCode.id },
      data: { isUsed: true, attempts: { increment: 1 } },
    });

    return true;
  }

  async sendVerificationCode(contact: string, code: string, isEmail: boolean) {
    if (isEmail) {
      await this.sendEmailVerification(contact, code);
    } else {
      await this.sendSmsVerification(contact, code);
    }
  }

  private async sendEmailVerification(email: string, code: string) {
    await this.emailService.sendVerificationCode(email, code);
  }

  private async sendSmsVerification(phone: string, code: string) {
    await this.smsService.sendVerificationCode(phone, code);
  }

  private generateCode(type: VerificationType): string {
    if (type === VerificationType.GOOGLE_AUTH) {
      return uuidv4();
    }
    return randomInt(1000, 10000).toString();
  }

  private async bumpFailedAttempts(userId: string, type: VerificationType) {
    const activeVerification = await this.prisma.verificationCode.findFirst({
      where: {
        userId,
        type,
        isUsed: false,
        blockedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeVerification) {
      return;
    }

    const attempts = activeVerification.attempts + 1;
    await this.prisma.verificationCode.update({
      where: { id: activeVerification.id },
      data: {
        attempts,
        blockedAt: attempts >= activeVerification.maxAttempts ? new Date() : null,
      },
    });
  }
}
