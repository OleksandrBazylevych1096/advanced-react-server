import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RedisService } from '../redis/redis.service';
import { RATE_LIMIT_OPTIONS, RateLimitOptions } from './rate-limit.decorator';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(
      RATE_LIMIT_OPTIONS,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const client = this.redisService.getClient();
    const ip = this.resolveIp(request);
    const key = `${options.keyPrefix}:${ip}`;
    const hits = await client.incr(key);
    if (hits === 1) {
      await client.expire(key, options.ttlSeconds);
    }

    if (hits > options.limit) {
      throw new HttpException({
        code: 'RATE_LIMITED',
        message: 'Too many requests',
        details: {
          keyPrefix: options.keyPrefix,
          limit: options.limit,
          ttlSeconds: options.ttlSeconds,
        },
      }, HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }

  private resolveIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const value = raw?.split(',')[0]?.trim() || request.ip || 'unknown';
    return value.startsWith('::ffff:') ? value.slice('::ffff:'.length) : value;
  }
}
