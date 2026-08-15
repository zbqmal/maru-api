import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ResetPasswordDto } from '../reset-password.dto';

describe('ResetPasswordDto', () => {
  const validReset = {
    token: 'valid-reset-token',
    newPassword: 'NewStr0ngPassword!',
  };

  it.each(['alllowercase1!', 'ALLUPPERCASE1!', 'NoNumber!', 'NoSpecial1'])(
    'rejects a password missing a required character type',
    (newPassword) => {
      const input = plainToInstance(ResetPasswordDto, {
        ...validReset,
        newPassword,
      });

      const errors = validateSync(input);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('newPassword');
      expect(errors[0]?.constraints?.matches).toBeDefined();
    },
  );

  it('accepts a password with every required character type', () => {
    const input = plainToInstance(ResetPasswordDto, validReset);

    expect(validateSync(input)).toHaveLength(0);
  });
});
