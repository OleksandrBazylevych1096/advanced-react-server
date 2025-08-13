// user/user.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from '../auth/dto/register.dto';
import { GoogleAuthDto } from '../auth/dto/google-auth.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async create(registerDto: RegisterDto) {
    if (!registerDto.email && !registerDto.phone) {
      throw new BadRequestException(
        'Either email or phone number must be provided',
      );
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email?.trim() || null,
        phone: registerDto.phone?.trim() || null,
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        phone: true,
        isVerified: true,
        createdAt: true,
      },
    });

    return user;
  }

  async createOrUpdateGoogleUser(googleAuthDto: GoogleAuthDto) {
    let user = await this.findByGoogleId(googleAuthDto.googleId);

    if (user) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          email: googleAuthDto.email,
          isVerified: true,
          verifiedAt: new Date(),
        },
      });
    } else {
      const existingUserByEmail = await this.findByEmail(googleAuthDto.email);

      if (existingUserByEmail) {
        user = await this.prisma.user.update({
          where: { id: existingUserByEmail.id },
          data: {
            googleId: googleAuthDto.googleId,
            isVerified: true,
            verifiedAt: new Date(),
          },
        });
      } else {
        user = await this.prisma.user.create({
          data: {
            googleId: googleAuthDto.googleId,
            email: googleAuthDto.email,
            isVerified: true,
            verifiedAt: new Date(),
          },
        });
      }
    }

    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findByPhone(phone: string) {
    return this.prisma.user.findUnique({
      where: { phone },
    });
  }

  async findByEmailOrPhone(email?: string, phone?: string) {
    if (email) {
      return this.findByEmail(email);
    }
    if (phone) {
      return this.findByPhone(phone);
    }
    return null;
  }

  async findByGoogleId(googleId: string) {
    return this.prisma.user.findUnique({
      where: { googleId },
    });
  }

  async findOne(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async verifyUser(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        isVerified: true,
        verifiedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        phone: true,
        isVerified: true,
        verifiedAt: true,
      },
    });
  }
}
