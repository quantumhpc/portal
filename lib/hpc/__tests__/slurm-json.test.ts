/**
 * The JSON path (Slurm ≥ 21.08) must give downstream code exactly what the
 * text path gives. Runs the real backend against the dev mocks, once as
 * Slurm 23.11 (JSON) and once as 20.11 (text), on the same cluster state.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Each test runs the mock scheduler commands dozens of times: allow for a busy machine.
vi.setConfig({ testTimeout: 30_000 });
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as slurm from '../slurm';
import { hpcFormatter } from '../formatter';
import { getConfig } from '@/lib/config';
import { num, minutes, duration } from '../slurm/json';
import { resetJsonSupport } from '../json-query';
import type { HpcConfig } from '../exec';

const config = {
  method: 'local',
  binariesDir: path.resolve('dev/slurm-mock'),
  localShell: '/bin/bash',
  username: os.userInfo().username,
  uid: process.getuid!(),
  gid: process.getgid!(),
  home: os.homedir(),
  useSharedDir: true,
} as unknown as HpcConfig;

const saved = { ...process.env };
beforeAll(() => {
  process.env.QHPC_MOCK_STATE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'slurm-mock-'));
  process.env.QHPC_MOCK_SCENARIO = 'busy';
});
afterAll(() => {
  process.env = saved;
});

async function runAs(version: string) {
  process.env.QHPC_MOCK_SLURM_VERSION = version;
  resetJsonSupport();
  const nodes = await slurm.snodes(config);
  const partitions = await slurm.spartitions(config);
  const queue = await slurm.squeue(config);
  const job = await slurm.scontrolJob(config, queue[0].JOBID);
  return { nodes, partitions, queue, job };
}

// The node formatter caches cluster_config on first use and only converts memory then;
// reset it so both paths are formatted from the same starting state.
const fresh = () => {
  delete (getConfig().hpcGlobalConfig as any).cluster_config;
};

const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.map((k) => [k, o?.[k]]));

describe('Slurm JSON vs text', () => {
  it('produces the same fields on both paths', async () => {
    const json = await runAs('23.11.4');
    const text = await runAs('20.11.9');

    const nodeKeys = ['NodeName', 'State', 'CPUTot', 'CPUAlloc', 'RealMemory', 'FreeMem', 'AllocMem', 'AvailableFeatures', 'Gres', 'Partitions'];
    expect(json.nodes.map((n: any) => pick(n, nodeKeys))).toEqual(text.nodes.map((n: any) => pick(n, nodeKeys)));

    const partKeys = ['PartitionName', 'State', 'Nodes', 'TotalNodes', 'TotalCPUs', 'Default', 'MaxTime'];
    expect(json.partitions.map((p: any) => pick(p, partKeys))).toEqual(text.partitions.map((p: any) => pick(p, partKeys)));

    const queueKeys = ['JOBID', 'NAME', 'USER', 'STATE', 'PARTITION', 'REASON', 'TIME_LIMIT', 'PRIORITY', 'WORK_DIR'];
    expect(json.queue.length).toBeGreaterThan(0);
    expect(json.queue.map((j: any) => pick(j, queueKeys))).toEqual(text.queue.map((j: any) => pick(j, queueKeys)));

    const jobKeys = ['JobId', 'JobName', 'UserId', 'JobState', 'Reason', 'Priority', 'Partition', 'TimeLimit', 'WorkDir', 'StdOut', 'StdErr', 'NumCPUs'];
    expect(pick(json.job, jobKeys)).toEqual(pick(text.job, jobKeys));
  });

  it('formats nodes and jobs identically', async () => {
    const json = await runAs('23.11.4');
    const text = await runAs('20.11.9');
    // NodeListResult: cluster totals must match; per node, compare the keys both paths have
    // (text output carries extras nobody reads: OS, Boards…).
    const fj = (fresh(), hpcFormatter('slurm', 'node', json.nodes));
    const ft = (fresh(), hpcFormatter('slurm', 'node', text.nodes));
    expect(fj.status).toEqual(ft.status);
    expect(fj.nodes).toHaveLength(ft.nodes.length);
    fj.nodes.forEach((n: any, i: number) => {
      const shared = Object.keys(n).filter((k) => k in ft.nodes[i] && k !== 'Version');
      expect(shared.length).toBeGreaterThan(15);
      expect(pick(n, shared)).toEqual(pick(ft.nodes[i], shared));
    });
    const jobFields = ['jobId', 'name', 'username', 'status', 'queue', 'priority'];
    const fmt = (q: any[]) => [].concat(hpcFormatter('slurm', 'job', q)).map((j: any) => pick(j, jobFields));
    expect(fmt(json.queue)).toEqual(fmt(text.queue));
    expect(fmt(json.queue)[0].status).toBeTruthy();
  });

  it('reports a missing job as an error on both paths', async () => {
    for (const v of ['23.11.4', '20.11.9']) {
      process.env.QHPC_MOCK_SLURM_VERSION = v;
      resetJsonSupport();
      await expect(slurm.scontrolJob(config, '999999')).rejects.toThrow(/Invalid job id/);
    }
  });
});

describe('JSON value helpers', () => {
  it('reads plain and wrapped numbers', () => {
    expect(num(4)).toBe(4);
    expect(num({ set: true, infinite: false, number: 4 })).toBe(4);
    expect(num({ set: false, infinite: false, number: 0 })).toBeUndefined();
    expect(num({ set: true, infinite: true, number: 0 })).toBe('UNLIMITED');
  });

  it('formats durations like Slurm', () => {
    expect(minutes(60)).toBe('01:00:00');
    expect(minutes(1440)).toBe('1-00:00:00');
    expect(minutes({ set: true, infinite: true, number: 0 })).toBe('UNLIMITED');
    expect(duration(90061)).toBe('1-01:01:01');
  });
});

describe('expandHostlist', () => {
  it('expands ranges, lists and zero padding', () => {
    expect(slurm.expandHostlist('c[1-3,5],gpu01')).toEqual(['c1', 'c2', 'c3', 'c5', 'gpu01']);
    expect(slurm.expandHostlist('n[08-10]')).toEqual(['n08', 'n09', 'n10']);
    expect(slurm.expandHostlist('c1')).toEqual(['c1']);
    expect(slurm.expandHostlist('')).toEqual([]);
  });
});

describe('Slurm queue rows for the jobs table', () => {
  it('map CPUS, TIME and TIME_LIMIT to procs, elapsedtime and walltime', () => {
    const [job] = hpcFormatter('slurm', 'job', [
      { JOBID: '7', NAME: 'run', USER: 'alice', STATE: 'RUNNING', TIME: '1-00:00:05', TIME_LIMIT: '2-00:00:00', CPUS: '4' },
    ]);
    expect(job).toMatchObject({ jobId: '7', name: 'run', username: 'alice', status: 'Running', procs: '4', elapsedtime: '1-00:00:05', walltime: '2-00:00:00' });
    expect(job.remainingtime).toBe('23:59:55');
    expect(job.jobProgress).toBe(50);
  });
});
