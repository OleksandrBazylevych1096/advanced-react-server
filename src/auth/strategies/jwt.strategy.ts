import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../../user/user.service';
import type { Request } from 'express';
import { AuthTokenService } from '../token.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly tokenService: AuthTokenService,
    private userService: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          return req?.cookies?.access_token;
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: tokenService.getAccessSecret(),
    });
  }

  async validate(payload: any) {
    if (payload?.tokenType !== 'access') {
      throw new UnauthorizedException({ code: 'ACCESS_TOKEN_INVALID' });
    }
    const user = await this.userService.findOne(payload.sub);
    if (!user) {
      throw new UnauthorizedException({ code: 'USER_NOT_FOUND' });
    }
    return user;
  }
}
