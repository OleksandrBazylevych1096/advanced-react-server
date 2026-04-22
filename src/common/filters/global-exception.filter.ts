import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

type ErrorBody = {
  code: string;
  message?: string;
  details?: unknown;
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, body } = this.normalizeException(exception);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} failed with ${body.code}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      ...body,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private normalizeException(exception: unknown): {
    status: number;
    body: ErrorBody;
  } {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          status: HttpStatus.CONFLICT,
          body: { code: 'RESOURCE_CONFLICT', message: 'Unique constraint failed' },
        };
      }

      if (exception.code === 'P2025') {
        return {
          status: HttpStatus.NOT_FOUND,
          body: { code: 'RESOURCE_NOT_FOUND', message: 'Record not found' },
        };
      }

      return {
        status: HttpStatus.BAD_REQUEST,
        body: { code: 'DATABASE_ERROR', message: 'Database request failed' },
      };
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: { code: 'DATABASE_VALIDATION_ERROR', message: 'Invalid database query' },
      };
    }

    if (exception instanceof HttpException) {
      return {
        status: exception.getStatus(),
        body: this.normalizeHttpBody(exception),
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
    };
  }

  private normalizeHttpBody(exception: HttpException): ErrorBody {
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return {
        code: this.defaultCodeForStatus(exception.getStatus()),
        message: response,
      };
    }

    if (response && typeof response === 'object') {
      const body = response as {
        code?: string;
        message?: string | string[];
        error?: string;
        details?: unknown;
      };

      const message = Array.isArray(body.message)
        ? body.message.join(', ')
        : body.message ?? body.error;

      return {
        code: body.code ?? this.defaultCodeForStatus(exception.getStatus()),
        ...(message ? { message } : {}),
        ...(body.details !== undefined ? { details: body.details } : {}),
      };
    }

    if (exception instanceof BadRequestException) {
      return { code: 'BAD_REQUEST', message: 'Bad request' };
    }

    return {
      code: this.defaultCodeForStatus(exception.getStatus()),
      message: exception.message,
    };
  }

  private defaultCodeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMITED';
      default:
        return 'HTTP_ERROR';
    }
  }
}
