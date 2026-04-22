import { Module } from '@nestjs/common';
import { VerificationService } from './verification.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [PrismaModule, EmailModule, SmsModule],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class VerificationModule {}
