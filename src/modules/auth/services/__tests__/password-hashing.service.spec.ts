import { PasswordHashingService } from '../password-hashing.service';

describe('PasswordHashingService', () => {
  const passwordHashingService = new PasswordHashingService();

  it('hashes and verifies a password', async () => {
    const password = 'Str0ngPassword!';
    const hashedPassword = await passwordHashingService.hashPassword(password);
    const isValid = await passwordHashingService.verifyPassword(
      password,
      hashedPassword,
    );

    expect(hashedPassword).not.toBe(password);
    expect(isValid).toBe(true);
  });

  it('rejects an invalid password', async () => {
    const hashedPassword =
      await passwordHashingService.hashPassword('Str0ngPassword!');
    const isValid = await passwordHashingService.verifyPassword(
      'wrong-password',
      hashedPassword,
    );

    expect(isValid).toBe(false);
  });

  it('returns false for malformed hashes', async () => {
    const isValid = await passwordHashingService.verifyPassword(
      'Str0ngPassword!',
      'malformed-hash',
    );

    expect(isValid).toBe(false);
  });
});
