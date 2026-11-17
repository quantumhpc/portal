/**
 * The PBS JSON path (`-F json`) must give downstream code what the text path
 * gives. Runs the real backend against the dev mocks, as PBS 2022 (JSON) and
 * as 13.1 (text only), on the same cluster state.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Each test runs the mock scheduler commands dozens of times: allow for a busy machine.
vi.setConfig({ testTimeout: 30_000 });
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as pbs from '../pbs';
import { hpcFormatter } from '../formatter';
import { getConfig } from '@/lib/config';
import { resetJsonSupport, parseLenientJson } from '../json-query';
import { flatten } from '../pbs/json';
import type { HpcConfig } from '../exec';

const base = {
  method: 'local',
  binariesDir: path.resolve('dev/pbs-mock'),
  localShell: '/bin/bash',
  username: os.userInfo().username,
  uid: process.getuid!(),
  gid: process.getgid!(),
  home: os.homedir(),
  useSharedDir: false,
} as unknown as HpcConfig;

const saved = { ...process.env };
beforeAll(() => {
  process.env.QHPC_MOCK_STATE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'pbs-mock-'));
  process.env.QHPC_MOCK_SCENARIO = 'busy';
});
afterAll(() => {
  process.env = saved;
});

async function runAs(version: string) {
  process.env.QHPC_MOCK_PBS_VERSION = version;
  resetJsonSupport();
  const list = await pbs.qstat(base);
  return {
    nodes: await pbs.qnodes(base),
    queues: await pbs.qqueues(base),
    list,
    alt: await pbs.qstat({ ...base, useAlternate: true } as HpcConfig),
    all: await pbs.qstat(base, 'all'),
    job: await pbs.qstat(base, list[0].jobId),
  };
}

// The node formatter caches cluster_config on first use and only converts memory then;
// reset it so both paths are formatted from the same starting state.
const fresh = () => {
  delete (getConfig().hpcGlobalConfig as any).cluster_config;
};

// Elapsed times come from the mock's clock and drift between the two runs.
const noClock = (v: any): any =>
  Array.isArray(v) ? v.map(noClock) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).filter(([k]) => !['time', 'resources_used.walltime', 'elapsedtime'].includes(k)).map(([k, x]) => [k, noClock(x)]))
    : v;

describe('PBS JSON vs text', () => {
  it('produces the same records on both paths', async () => {
    const json = await runAs('2022.1.1');
    const text = await runAs('13.1');

    expect(json.nodes).toEqual(text.nodes);
    expect(json.queues).toEqual(text.queues);
    expect(json.list.length).toBeGreaterThan(0);
    expect(noClock(json.list)).toEqual(noClock(text.list));

    // The text "alternate" parser expects 5 header lines; the mock prints 2, so only check JSON here.
    expect(json.alt.map((j: any) => [j.jobId, j.user, j.status])).toEqual(json.list.map((j: any) => [j.jobId, j.user, j.status[0]]));

    expect(noClock(json.all)).toEqual(noClock(text.all));
    expect(noClock(json.job)).toEqual(noClock(text.job));
    expect(json.job.Variable_List.PBS_O_WORKDIR).toBeTruthy();
  });

  it('formats nodes, queues and jobs identically', async () => {
    const json = await runAs('2022.1.1');
    const text = await runAs('13.1');
    expect((fresh(), hpcFormatter('pbs', 'node', json.nodes))).toEqual((fresh(), hpcFormatter('pbs', 'node', text.nodes)));
    expect(hpcFormatter('pbs', 'queue', json.queues)).toEqual(hpcFormatter('pbs', 'queue', text.queues));
    expect(noClock(hpcFormatter('pbs', 'job', json.list))).toEqual(noClock(hpcFormatter('pbs', 'job', text.list)));
  });

  it('reports queue type from the E/R column', async () => {
    const text = await runAs('13.1');
    expect(text.queues[0].type).toBe('Execution');
  });

  it('reports an unknown job as an error on both paths', async () => {
    for (const v of ['2022.1.1', '13.1']) {
      process.env.QHPC_MOCK_PBS_VERSION = v;
      resetJsonSupport();
      await expect(pbs.qstat(base, '999999')).rejects.toThrow(/Unknown Job Id/);
    }
  });
});

describe('PBS JSON helpers', () => {
  it('repairs stray backslashes PBS leaves in job variables', () => {
    expect(parseLenientJson('{"v":"C:\\qhpc\\n"}')).toEqual({ v: 'C:\\qhpc\n' });
  });

  it('flattens resources but keeps Variable_List', () => {
    expect(flatten({ Resource_List: { ncpus: 4 }, Variable_List: { A: 1 }, jobs: ['1/0', '1/1'] }, ['Variable_List'])).toEqual({
      'Resource_List.ncpus': '4',
      Variable_List: { A: '1' },
      jobs: '1/0, 1/1',
    });
  });
});
