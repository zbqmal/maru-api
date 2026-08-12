import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from '../all-exceptions.filter';

function createMockHost(method = 'GET', url = '/test') {
  const mockJson = jest.fn();
  const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
  const mockResponse = { status: mockStatus };
  const mockRequest = { method, url };

  const host = {
    switchToHttp: () => ({
      getResponse: () => mockResponse,
      getRequest: () => mockRequest,
    }),
  } as unknown as ArgumentsHost;

  return { host, mockStatus, mockJson };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('returns structured body for HttpException', () => {
    const { host, mockStatus, mockJson } = createMockHost();
    const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);

    filter.catch(exception, host);

    expect(mockStatus).toHaveBeenCalledWith(404);
    const body = (mockJson.mock.calls[0] as [Record<string, unknown>])[0];
    expect(body.statusCode).toBe(404);
    expect(body.path).toBe('/test');
    expect(typeof body.timestamp).toBe('string');
  });

  it('returns 500 for unknown exceptions', () => {
    const { host, mockStatus, mockJson } = createMockHost();

    filter.catch(new Error('boom'), host);

    expect(mockStatus).toHaveBeenCalledWith(500);
    const body = (mockJson.mock.calls[0] as [Record<string, unknown>])[0];
    expect(body.statusCode).toBe(500);
    expect(body.message).toBe('Internal server error');
  });

  it('extracts message array from ValidationPipe HttpException', () => {
    const { host, mockStatus, mockJson } = createMockHost();
    const exception = new HttpException(
      {
        statusCode: 400,
        message: ['field must not be empty'],
        error: 'Bad Request',
      },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, host);

    expect(mockStatus).toHaveBeenCalledWith(400);
    const body = (mockJson.mock.calls[0] as [Record<string, unknown>])[0];
    expect(Array.isArray(body.message)).toBe(true);
    expect(body.error).toBe('Bad Request');
  });
});
