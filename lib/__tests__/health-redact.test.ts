import { describe, it, expect, vi } from 'vitest';

// redact() is pure; stub the modules lib/health pulls in for the checks.
vi.mock('@/lib/hpc/managers', () => ({}));
vi.mock('@/lib/db/connection', () => ({}));
const { redact } = await import('../health');

describe('support bundle redaction', () => {
  it('removes secrets at any depth and keeps the rest', () => {
    const out = redact({
      use_pam: true,
      db: { driver: 'mongo', uri: 'mongodb://u:p@h/db' },
      scheduler: { secretAccessKey: '/root/.ssh/id', serverName: 'login1' },
      list: [{ password: 'x', name: 'a' }],
      ssl_privateKey: 'ssl/privkey.pem',
      NEXTAUTH_SECRET: 'abc',
      apiToken: 't',
      empty: { password: '' },
      remote_security: 'none',
    });
    expect(out).toEqual({
      use_pam: true,
      db: { driver: 'mongo', uri: '[redacted]' },
      scheduler: { secretAccessKey: '[redacted]', serverName: 'login1' },
      list: [{ password: '[redacted]', name: 'a' }],
      ssl_privateKey: '[redacted]',
      NEXTAUTH_SECRET: '[redacted]',
      apiToken: '[redacted]',
      empty: { password: '' },
      remote_security: 'none',
    });
  });
});
