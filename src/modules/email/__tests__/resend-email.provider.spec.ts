import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { ResendEmailProvider } from '../resend-email.provider';
import { SendEmailOptions } from '../types/email.types';

jest.mock('resend');

describe('ResendEmailProvider', () => {
  const mockSend = jest.fn();

  const configServiceMock = {
    get: jest.fn((key: string) => {
      if (key === 'RESEND_API_KEY') return 're_test_key';
      if (key === 'EMAIL_FROM') return 'noreply@example.com';
      return undefined;
    }),
  } as unknown as ConfigService;

  let provider: ResendEmailProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    (Resend as jest.MockedClass<typeof Resend>).mockImplementation(
      () =>
        ({
          emails: { send: mockSend },
        }) as unknown as Resend,
    );

    provider = new ResendEmailProvider(configServiceMock);
  });

  it('sends an email via Resend with the configured from address', async () => {
    mockSend.mockResolvedValue({ data: { id: 'msg-1' }, error: null });

    const options: SendEmailOptions = {
      to: 'user@example.com',
      subject: 'Test Subject',
      html: '<p>Test</p>',
    };

    await provider.send(options);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({
      from: 'noreply@example.com',
      to: 'user@example.com',
      subject: 'Test Subject',
      html: '<p>Test</p>',
      text: undefined,
    });
  });

  it('sends with an optional plain-text body', async () => {
    mockSend.mockResolvedValue({ data: { id: 'msg-2' }, error: null });

    await provider.send({
      to: 'user@example.com',
      subject: 'Subject',
      html: '<p>Hello</p>',
      text: 'Hello',
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Hello' }),
    );
  });

  it('throws when Resend returns an error', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { message: 'Invalid API key', name: 'validation_error' },
    });

    await expect(
      provider.send({
        to: 'user@example.com',
        subject: 'Subject',
        html: '<p>Hello</p>',
      }),
    ).rejects.toThrow('Email delivery failed: Invalid API key');
  });

  it('initialises Resend with the API key from config', () => {
    expect(Resend).toHaveBeenCalledWith('re_test_key');
  });
});
