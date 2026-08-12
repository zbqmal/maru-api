import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { LoggingInterceptor } from '../logging.interceptor';

function createMockContext(method = 'GET', url = '/test') {
  const mockResponse = { statusCode: 200 };
  const mockRequest = { method, url };

  return {
    switchToHttp: () => ({
      getRequest: () => mockRequest,
      getResponse: () => mockResponse,
    }),
  } as unknown as ExecutionContext;
}

describe('LoggingInterceptor', () => {
  const interceptor = new LoggingInterceptor();

  it('passes through the response value', (done) => {
    const context = createMockContext();
    const next: CallHandler = { handle: () => of({ hello: 'world' }) };

    interceptor.intercept(context, next).subscribe({
      next: (value) => {
        expect(value).toEqual({ hello: 'world' });
        done();
      },
    });
  });
});
