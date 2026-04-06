import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import * as bcrypt from 'bcrypt';
import { BCRYPT_ROUNDS } from './auth.constants';
import { AuthCryptoService } from './crypto.service';
import { randomTokenBytes } from './utils/crypto.util';

@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: AuthCryptoService,
  ) {}

  async setupTotp(userId: string, emailOrPhone: string) {
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(emailOrPhone, 'AdvancedReactShop', secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauth);
    const backupCodesPlain = Array.from({ length: 10 }, () =>
      randomTokenBytes(6).replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase(),
    );
    await this.prisma.backupCode.deleteMany({ where: { userId } });
    await this.prisma.backupCode.createMany({
      data: await Promise.all(
        backupCodesPlain.map(async (code) => ({
          userId,
          codeHash: await bcrypt.hash(code, BCRYPT_ROUNDS),
        })),
      ),
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: this.crypto.encrypt(secret),
        twoFactorMethod: 'TOTP' as any,
      },
    });
    return { qrCodeDataUrl, backupCodes: backupCodesPlain };
  }

  async enableTotp(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.twoFactorSecret) {
      throw new UnauthorizedException({ code: 'TWO_FACTOR_NOT_SETUP' });
    }
    const secret = this.crypto.decrypt(user.twoFactorSecret);
    const ok = authenticator.verify({ token: code, secret });
    if (!ok) throw new UnauthorizedException({ code: 'TOTP_INVALID' });
    await this.prisma.user.update({
      where: { id: userId },
      data: { isTwoFactorEnabled: true, twoFactorMethod: 'TOTP' as any },
    });
  }

  async verifyTotp(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.twoFactorSecret) throw new UnauthorizedException({ code: 'TWO_FACTOR_DISABLED' });
    const secret = this.crypto.decrypt(user.twoFactorSecret);
    const ok = authenticator.verify({ token: code, secret });
    if (!ok) throw new UnauthorizedException({ code: 'TOTP_INVALID' });
  }

  async verifyBackupCode(userId: string, code: string) {
    const codes = await this.prisma.backupCode.findMany({
      where: { userId, usedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    for (const backupCode of codes) {
      if (await bcrypt.compare(code, backupCode.codeHash)) {
        await this.prisma.backupCode.update({
          where: { id: backupCode.id },
          data: { usedAt: new Date() },
        });
        return;
      }
    }
    throw new UnauthorizedException({ code: 'BACKUP_CODE_INVALID' });
  }

  async disable(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isTwoFactorEnabled: false,
        twoFactorMethod: null,
        twoFactorSecret: null,
      },
    });
  }
}

