import { describe, it, expect } from 'vitest';
import { tenantOwnsPlatform, tenantScope } from '../../src/strategy-compiler/tenant.js';

describe('tenant rights scoping', () => {
  it('confirms ownership when platform is in tenant scope', () => {
    expect(tenantOwnsPlatform('tenant-001', ['platform-x'], 'platform-x')).toBe(true);
  });

  it('rejects platforms outside tenant scope', () => {
    expect(tenantOwnsPlatform('tenant-001', ['platform-x'], 'platform-y')).toBe(false);
  });

  it('derives a stable tenant scope key', () => {
    expect(tenantScope('tenant-001')).toBe('tenant:tenant-001');
  });
});
