import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const SCRYPT_PREFIX = 'scrypt';
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const MAX_MEMORY = 32 * 1024 * 1024;

@Injectable()
export class PasswordHashingService {
  async hashPassword(password: string): Promise<string> {
    if (password.length === 0) {
      throw new Error('Password must not be empty.');
    }

    const salt = randomBytes(16).toString('base64url');
    const hash = (await scryptAsync(password, salt, SCRYPT_KEYLEN, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: MAX_MEMORY,
    })) as Buffer;

    return [
      SCRYPT_PREFIX,
      SCRYPT_N.toString(),
      SCRYPT_R.toString(),
      SCRYPT_P.toString(),
      salt,
      hash.toString('base64url'),
    ].join('$');
  }

  async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const parts = storedHash.split('$');

    if (parts.length !== 6 || parts[0] !== SCRYPT_PREFIX) {
      return false;
    }

    const n = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = parts[4];
    const hashBuffer = Buffer.from(parts[5], 'base64url');

    if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
      return false;
    }

    const candidateHash = (await scryptAsync(password, salt, hashBuffer.length, {
      N: n,
      r,
      p,
      maxmem: MAX_MEMORY,
    })) as Buffer;

    if (candidateHash.length !== hashBuffer.length) {
      return false;
    }

    return timingSafeEqual(candidateHash, hashBuffer);
  }
}
