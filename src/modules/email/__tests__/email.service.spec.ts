import { EmailService } from '../email.service';
import { EmailProvider, SendEmailOptions } from '../types/email.types';

describe('EmailService', () => {
  const mockProvider: jest.Mocked<EmailProvider> = {
    send: jest.fn(),
  };

  let emailService: EmailService;

  beforeEach(() => {
    jest.clearAllMocks();
    emailService = new EmailService(mockProvider);
  });

  it('delegates send to the underlying provider', async () => {
    mockProvider.send.mockResolvedValue(undefined);

    const options: SendEmailOptions = {
      to: 'user@example.com',
      subject: 'Hello',
      html: '<p>Hello</p>',
    };

    await emailService.send(options);

    expect(mockProvider.send.mock.calls).toHaveLength(1);
    expect(mockProvider.send.mock.calls[0]).toEqual([options]);
  });

  it('propagates errors thrown by the provider', async () => {
    mockProvider.send.mockRejectedValue(new Error('Delivery failed'));

    await expect(
      emailService.send({
        to: 'user@example.com',
        subject: 'Hello',
        html: '<p>Hello</p>',
      }),
    ).rejects.toThrow('Delivery failed');
  });

  it('forwards multiple recipients to the provider', async () => {
    mockProvider.send.mockResolvedValue(undefined);

    const options: SendEmailOptions = {
      to: ['a@example.com', 'b@example.com'],
      subject: 'Broadcast',
      html: '<p>Hi all</p>',
      text: 'Hi all',
    };

    await emailService.send(options);

    expect(mockProvider.send.mock.calls[0]).toEqual([options]);
  });
});
