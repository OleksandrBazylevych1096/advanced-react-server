import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { EMAIL_PROVIDER } from './auth.constants';
import type { EmailProvider } from './interfaces/notification-provider.interfaces';
import { randomTokenBytes, sha256Hex } from './utils/crypto.util';

@Injectable()
export class PasswordRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
  ) {}

  async createResetToken(userId: string) {
    const token = randomTokenBytes(32);
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await this.prisma.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt },
    });
    return token;
  }

  async sendResetLink(email: string, link: string) {
    await this.emailProvider.sendPasswordResetLink(email, link);
  }

  async consumeResetToken(token: string) {
    const tokenHash = sha256Hex(token);
    const record = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!record) return null;
    await this.prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    return record;
  }
}
