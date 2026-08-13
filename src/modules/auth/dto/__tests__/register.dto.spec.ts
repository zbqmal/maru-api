import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RegisterDto } from '../register.dto';

describe('RegisterDto', () => {
  const validRegistration = {
    email: 'user@example.com',
    password: 'Str0ngPassword!',
    name: 'Maru User',
  };

  it.each(['alllowercase1!', 'ALLUPPERCASE1!', 'NoNumber!', 'NoSpecial1'])(
    'rejects a password missing a required character type',
    (password) => {
      const input = plainToInstance(RegisterDto, {
        ...validRegistration,
        password,
      });

      const errors = validateSync(input);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('password');
      expect(errors[0]?.constraints?.matches).toBeDefined();
    },
  );

  it('accepts a password with every required character type', () => {
    const input = plainToInstance(RegisterDto, validRegistration);

    expect(validateSync(input)).toHaveLength(0);
  });
});
