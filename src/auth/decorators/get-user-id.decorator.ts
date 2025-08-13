import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GetUserId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    console.log(request);
    if (!request.user?.id) {
      throw new Error('User ID not found in request');
    }
    return request.user.id;
  },
);
