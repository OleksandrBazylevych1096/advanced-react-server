import { BadRequestException } from '@nestjs/common';
import { VerificationType } from '@prisma/client';
import { VerificationService } from './verification.service';

describe('VerificationService', () => {
  it('generates cryptographically random 4-digit codes for non-google verification', async () => {
    const service = new VerificationService(
      {
        verificationCode: {
          findFirst: jest.fn().mockResolvedValue(null),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: jest.fn().mockResolvedValue({}),
        },
      } as any,
      { sendVerificationCode: jest.fn() } as any,
      { sendVerificationCode: jest.fn() } as any,
    );

    const first = await service.createVerificationCode('user-1', VerificationType.REGISTRATION);
    const second = await service.createVerificationCode('user-1', VerificationType.REGISTRATION);

    expect(first).toMatch(/^\d{4}$/);
    expect(second).toMatch(/^\d{4}$/);
    expect(first).not.toBe(second);
  });

  it('rejects resend attempts inside the cooldown window', async () => {
    const now = new Date();
    const service = new VerificationService(
      {
        verificationCode: {
          findFirst: jest.fn().mockResolvedValue({
            lastSentAt: now,
          }),
        },
      } as any,
      { sendVerificationCode: jest.fn() } as any,
      { sendVerificationCode: jest.fn() } as any,
    );

    await expect(
      service.createVerificationCode('user-1', VerificationType.REGISTRATION),
    ).rejects.toThrow(BadRequestException);
  });
});
