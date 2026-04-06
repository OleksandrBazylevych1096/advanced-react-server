import { Injectable } from '@nestjs/common';
import { EmailService } from 'src/email/email.service';
import { EmailProvider } from '../interfaces/notification-provider.interfaces';

@Injectable()
export class SmtpEmailProviderAdapter implements EmailProvider {
  constructor(private readonly emailService: EmailService) {}

  async sendVerificationLink(email: string, link: string): Promise<void> {
    await this.emailService.sendVerificationCode(email, link);
  }

  async sendOtp(email: string, code: string): Promise<void> {
    await this.emailService.sendVerificationCode(email, code);
  }

  async sendPasswordResetLink(email: string, link: string): Promise<void> {
    await this.emailService.sendVerificationCode(email, link);
  }

  async sendSecurityAlert(
    email: string,
    subject: string,
    message: string,
  ): Promise<void> {
    await this.emailService.sendVerificationCode(
      email,
      `${subject}: ${message}`,
    );
  }
}

