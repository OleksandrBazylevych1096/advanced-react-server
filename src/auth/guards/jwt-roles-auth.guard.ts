import { Injectable, UseGuards, applyDecorators } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from '../rbac/roles.guard';

@Injectable()
export class JwtRolesAuthGuard extends JwtAuthGuard {}

export const UseJwtAndRolesGuards = () =>
  applyDecorators(UseGuards(JwtAuthGuard, RolesGuard));

