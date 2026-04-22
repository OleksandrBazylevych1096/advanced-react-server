import { SetMetadata } from '@nestjs/common';

export type RateLimitOptions = {
  ttlSeconds: number;
  limit: number;
  keyPrefix: string;
};

export const RATE_LIMIT_OPTIONS = 'rate_limit_options';

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_OPTIONS, options);
