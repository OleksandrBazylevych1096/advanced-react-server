import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { VerificationType } from '@prisma/client';
import { SmsService } from 'src/sms/sms.service';
import { v4 as uuidv4 } from 'uuid';

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
    const code = this.generateCode(type);

    // Expiration time: 2 minutes for GOOGLE_AUTH, 10 minutes otherwise
    const expiresAt = new Date();
    if (type === VerificationType.GOOGLE_AUTH) {
      expiresAt.setMinutes(expiresAt.getMinutes() + 2);
    } else {
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);
    }

    // Invalidate old codes
    await this.prisma.verificationCode.updateMany({
      where: {
        userId,
        type,
        isUsed: false,
      },
      data: {
        isUsed: true,
      },
    });

    // Save new code
    await this.prisma.verificationCode.create({
      data: {
        userId,
        code,
        type,
        expiresAt,
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
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!verificationCode) {
      throw new BadRequestException({ code: 'VERIFICATION_CODE_INVALID' });
    }

    await this.prisma.verificationCode.update({
      where: { id: verificationCode.id },
      data: { isUsed: true },
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
    console.log('Email code:', code);
    await this.emailService.sendVerificationCode(email, code);
  }

  private async sendSmsVerification(phone: string, code: string) {
    console.log('SMS code:', code);
    await this.smsService.sendVerificationCode(phone, code);
  }

  private generateCode(type: VerificationType): string {
    if (type === VerificationType.GOOGLE_AUTH) {
      return uuidv4();
    }
    return Math.floor(1000 + Math.random() * 9000).toString();
  }
}
