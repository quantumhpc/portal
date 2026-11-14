import { describe, it, expect } from 'vitest';
import { missingField } from '../template-fields';
import { defaultJobName } from '../seed-args';

describe('missingField', () => {
  const fields: any = {
    mesh: { type: 'file', label: 'Mesh', required: true },
    solver: { type: 'textField', label: 'Solver', required: true },
    extra: { type: 'textField', required: true, disabled: "usemesh == 'true'" },
  };

  it('returns the id and message of the first missing required field', () => {
    expect(missingField(fields, { usemesh: true, solver: 'x' })).toEqual({ id: 'mesh', message: 'Mesh: upload a file' });
    expect(missingField(fields, { usemesh: true, 'meshPath[]': ['/m'] })).toEqual({ id: 'solver', message: 'Solver is required' });
  });

  it('skips disabled fields and returns null when all are set', () => {
    expect(missingField(fields, { usemesh: true, 'meshPath[]': ['/m'], solver: 'x' })).toBeNull();
    expect(missingField(fields, { usemesh: false, solver: 'x' })).toEqual({ id: 'extra', message: 'extra is required' });
  });
});

describe('defaultJobName', () => {
  it('adds the month, day, hour and minute', () => {
    expect(defaultJobName('fluent', new Date(2026, 10, 3, 9, 5))).toBe('fluent-1103-0905');
  });
});
