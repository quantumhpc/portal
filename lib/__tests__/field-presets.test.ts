import { describe, expect, it } from 'vitest';
import { PRESETS, applyPreset, customPreset, fieldUsage, keyFromLabel, presetAdded } from '../field-presets';
import { applyTemplate } from '../hpc/job-template';
import { checkJobArgs, slurmResources } from '../hpc/slurm/options';

const empty = () => ({ fields: {}, parameters: { mainCommand: 'VAR.appBinaries', appBinaries: { v1: '/opt/app' } } });

describe('PRESETS', () => {
  it('have unique ids and never reuse a field key', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    const keys = PRESETS.flatMap((p) => Object.keys(p.fields));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('each one is used by the scheduler or the command once added', () => {
    for (const preset of PRESETS) {
      const draft = applyPreset(empty(), preset);
      expect(presetAdded(preset, draft)).toBe(true);
      for (const [key, field] of Object.entries(preset.fields)) {
        expect(fieldUsage(key, field, draft.parameters).used, `${preset.id}.${key}`).toBe(true);
      }
    }
  });

  it('all together expand to a clean command with nothing filled in', () => {
    const draft = PRESETS.reduce(applyPreset, empty());
    const args = applyTemplate(draft as any, { type: 'batch', numProcs: 2, precision: '', dimension: '3d' });
    expect(args.mainCommand).toBe('/opt/app 3d (-mpi=openmpi)'.replace(/[()]/g, ''));
    expect(args.prologueCommands).toBe('');
  });
});

describe('applyPreset', () => {
  it('adds the prologue line once and keeps existing defaults', () => {
    const modules = PRESETS.find((p) => p.id === 'modules')!;
    const mem = PRESETS.find((p) => p.id === 'mem')!;
    let draft: any = { fields: {}, parameters: { default: { mem: '16' } } };
    draft = applyPreset(applyPreset(applyPreset(draft, modules), modules), mem);
    expect(draft.parameters.prologueCommands).toEqual(['(module load VAR.modules)']);
    expect(draft.parameters.default.mem).toBe('16');
    const args = applyTemplate(draft, { type: 'batch', modules: 'gcc openmpi' });
    expect(args.prologueCommands).toBe('module load gcc openmpi');
  });
});

describe('customPreset', () => {
  it('builds a flag that adds its text only when ticked', () => {
    const draft: any = applyPreset(empty(), customPreset('flag', 'Use GPU solver', '-gpu'));
    expect(Object.keys(draft.fields)).toEqual(['useGpuSolver']);
    expect(applyTemplate(structuredClone(draft), { type: 'batch', useGpuSolver: true }).mainCommand).toBe('/opt/app -gpu');
    expect(applyTemplate(structuredClone(draft), { type: 'batch', useGpuSolver: false }).mainCommand).toBe('/opt/app');
  });

  it('builds a text value with its prefix, dropped when empty', () => {
    const draft: any = applyPreset(empty(), customPreset('text', 'Iterations', '-iter'));
    expect(applyTemplate(structuredClone(draft), { type: 'batch', iterations: '50' }).mainCommand).toBe('/opt/app -iter 50');
    expect(applyTemplate(structuredClone(draft), { type: 'batch', iterations: '' }).mainCommand).toBe('/opt/app');
  });
});

describe('keyFromLabel', () => {
  it('makes a camelCase key and avoids reserved and taken keys', () => {
    expect(keyFromLabel('Number of iterations')).toBe('numberOfIterations');
    expect(keyFromLabel('Queue')).toBe('queue2');
    expect(keyFromLabel('mem')).toBe('mem2');
    expect(keyFromLabel('Solver', { solver: {} })).toBe('solver2');
    expect(keyFromLabel('3D mode')).toBe('option3dMode');
  });
});

describe('slurmResources', () => {
  it('maps form keys to sbatch options', () => {
    expect(slurmResources({ numProcs: 4, mem: '8', gpus: '2', gpu: 'a100', nodes: '2', ntasksPerNode: 16, memPerCpu: '', account: 'proj1', array: '1-10%2', tmp: 20 }))
      .toEqual({ 'cpus-per-task': 4, mem: '8gb', gres: 'gpu:a100:2', nodes: 2, 'ntasks-per-node': 16, account: 'proj1', array: '1-10%2', tmp: '20G' });
    expect(slurmResources({ numProcs: 1, gpu: 'v100' })).toEqual({ 'cpus-per-task': 1, gres: 'gpu:v100:1' });
    expect(slurmResources({ numProcs: 1, gpus: '0', gpu: 'a100' })).toEqual({ 'cpus-per-task': 1 });
  });

  it('refuses a GPU type with a colon', () => {
    expect(() => slurmResources({ numProcs: 1, gpus: '1', gpu: 'a100:2' })).toThrow(/GPU type/);
  });

  it('refuses values that would add a line or a command to the script', () => {
    expect(() => slurmResources({ numProcs: 1, account: 'a\n#SBATCH --x' })).toThrow(/not allowed/);
    expect(() => slurmResources({ numProcs: 1, qos: 'a; rm -rf ~' })).toThrow(/not allowed/);
    expect(() => slurmResources({ numProcs: 1, nodes: 'two' })).toThrow(/whole number/);
    expect(() => slurmResources({ numProcs: 1, mem: '-4' })).toThrow(/whole number/);
  });

  it('refuses memory per node and per core together, and allows & and | in constraints', () => {
    expect(() => slurmResources({ numProcs: 1, mem: '8', memPerCpu: '2' })).toThrow(/not both/);
    expect(slurmResources({ numProcs: 1, constraint: 'avx512&ib|a100' }).constraint).toBe('avx512&ib|a100');
    expect(() => slurmResources({ numProcs: 1, account: 'a&b' })).toThrow(/not allowed/);
  });
});

describe('checkJobArgs', () => {
  it('accepts normal values', () => {
    const args = { walltimeHours: '2', walltimeMinutes: '30', mail: ' a.b@uni.edu ', outputFile: 'out-%j.log' };
    expect(() => checkJobArgs(args)).not.toThrow();
    expect(args.mail).toBe('a.b@uni.edu');
    expect(() => checkJobArgs({ walltimeHours: '', mail: '', outputFile: undefined })).not.toThrow();
  });

  it('refuses bad time limits, emails and output names', () => {
    expect(() => checkJobArgs({ walltimeHours: '1.5' })).toThrow(/whole number/);
    expect(() => checkJobArgs({ walltimeHours: 'abc' })).toThrow(/whole number/);
    expect(() => checkJobArgs({ walltimeMinutes: '90' })).toThrow(/0 and 59/);
    expect(() => checkJobArgs({ mail: 'a@b\n#SBATCH --x' })).toThrow(/Email/);
    expect(() => checkJobArgs({ mail: 'nobody' })).toThrow(/Email/);
    expect(() => checkJobArgs({ outputFile: '../x.log' })).toThrow(/Output file/);
    expect(() => checkJobArgs({ outputFile: '..' })).toThrow(/Output file/);
    expect(() => checkJobArgs({ outputFile: 'a b.log' })).toThrow(/Output file/);
  });
});
