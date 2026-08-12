import { SessionTokenService } from '../session-token.service';

describe('SessionTokenService', () => {
  const sessionTokenService = new SessionTokenService();

  it('generates opaque random tokens', () => {
    const tokenA = sessionTokenService.generateToken();
    const tokenB = sessionTokenService.generateToken();

    expect(tokenA).not.toHaveLength(0);
    expect(tokenA).not.toBe(tokenB);
  });

  it('hashes tokens deterministically with sha256', () => {
    const token = 'sample-token';
    const hashA = sessionTokenService.hashToken(token);
    const hashB = sessionTokenService.hashToken(token);

    expect(hashA).toHaveLength(64);
    expect(hashA).toBe(hashB);
    expect(hashA).not.toBe(token);
  });
});
