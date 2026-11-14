import { describe, it, expect } from 'vitest';
import { seedArgs } from '../seed-args';

const fields: any = { iterations: { type: 'textField' }, mesh: { type: 'file' } };
const base = { appDomain: 'demo', appName: 'a', type: 'batch', jobName: 'a', numProcs: 1, version: 'v2', iterations: '10', usemesh: true };

describe('seedArgs', () => {
  it('keeps known form keys and drops the rest', () => {
    const out = seedArgs(base, {
      appName: 'other', jobName: 'run', numProcs: '4', version: 'v1', iterations: '50',
      usemesh: false, workdir: '/x', outputFile: 'o',
    }, fields, ['v1', 'v2']);
    expect(out).toEqual({ ...base, jobName: 'run', numProcs: 4, version: 'v1', iterations: '50' });
  });

  it('falls back to the default version when the old one is gone', () => {
    expect(seedArgs(base, { version: 'v0' }, fields, ['v2']).version).toBe('v2');
  });
});
