import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const { method, url } = request;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - start;
          this.logger.log(`${method} ${url} ${response.statusCode} +${ms}ms`);
        },
        error: (err: unknown) => {
          const ms = Date.now() - start;
          const statusCode =
            typeof err === 'object' &&
            err !== null &&
            'status' in err &&
            typeof err.status === 'number'
              ? (err as { status: number }).status
              : 500;
          this.logger.log(`${method} ${url} ${statusCode} +${ms}ms`);
        },
      }),
    );
  }
}
