/**
 * HPC Output Formatter
 * Normalizes output from different HPC schedulers (PBS, SLURM) into a common format.
 * Ported from models/hpcFormatter.js + models/hpcDict/
 */

import { getConfig } from '@/lib/config';

// ---- HPC Dictionary codes ----
// Maps scheduler-specific field names to numeric codes

const hpcCodes: Record<string, Record<string, Record<string, Record<string, number>>>> = {
  pbs: {
    job: {
      key: {
        name: 1001, job_name: 1001, jobid: 1002, user: 1003, job_owner: 1003,
        euser: 10031, egroup: 10032, time: 1004, ctime: 10041, mtime: 10042,
        qtime: 10043, etime: 10044, stime: 10045, status: 1005, job_state: 1005,
        suspended: 10058, queue: 1006, server: 1007, comment: 1008, checkpoint: 1009,
        error_path: 100101, output_path: 100102, hold_types: 10011, join_path: 10012,
        keep_files: 10013, mail_points: 10014, priority: 10015, rerunable: 10016,
        'resource_list.walltime': 100204, shell_path_list: 10021, variable_list: 10022,
        pbs_o_home: 100221, pbs_o_workdir: 100227, submit_args: 10024,
        'resources_used.walltime': 10046, 'resource_list.ncpus': 10025,
      },
      value: {
        b: 100511, begun: 100511, e: 10052, exiting: 10052, f: 10051, finished: 10051,
        h: 10053, held: 10053, m: 100513, moved: 100513, q: 10054, queued: 10054,
        r: 10055, running: 10055, s: 10058, suspended: 10058, t: 10056, moving: 10056,
        u: 100514, usersuspended: 100514, w: 10057, waiting: 10057, x: 100512, expired: 100512,
      },
    },
    node: {
      key: {
        name: 2001, state: 2002, pcpus: 20020, 'resources_available.ncpus': 2006,
        'resources_available.mem': 20024, 'resources_available.memfree': 200123,
        'resources_available.memtotal': 200124, 'resources_assigned.mem': 2004002,
        'resources_assigned.ncpus': 2004004, gpus: 2008,
      },
      value: {
        busy: 21051, down: 21052, stateunknowndown: 21052, free: 21053,
        jobexclusive: 21054, offline: 21056, stateunknown: 21059, jobbusy: 21064,
      },
    },
    queue: { key: { name: 3001 }, value: {} },
  },
  slurm: {
    job: {
      key: {
        name: 1001, jobid: 1002, user: 1003, userid: 1003,
        // squeue TIME/TIME_LIMIT/CPUS, scontrol RunTime/TimeLimit/NumCPUs
        time: 10046, runtime: 10046, time_limit: 100204, timelimit: 100204, cpus: 10025, numcpus: 10025, ctime: 10041, mtime: 10042,
        qtime: 10043, etime: 10044, stime: 10045, state: 1005, jobstate: 1005,
        suspended: 10058, queue: 1006, server: 1007, comment: 1008, reason: 1008,
        priority: 10015, 'resource_list.walltime': 100204, work_dir: 100227,
        partition: 100229,
      },
      value: {
        pd: 10054, pending: 10054, r: 10055, running: 10055, cg: 10052,
        completing: 10052, cd: 10051, completed: 10051, f: 10059, failed: 10059,
        to: 100512, timeout: 100512, ca: 100510, cancelled: 100510,
        s: 10058, suspended: 10058,
      },
    },
    node: {
      key: {
        nodename: 2001, state: 2002, cputot: 20020, cpualloc: 2004004,
        freemem: 200123, realmemory: 200124, gpus: 2008,
      },
      value: {
        // mixed = some cores allocated; 21064 (job-busy) means all busy on PBS
        allocated: 21054, down: 21052, mixed: 21065, offline: 21056,
        idle: 21053, stateunknown: 21059,
      },
    },
    queue: { key: { partitionname: 3001 }, value: { up: 2105 } },
  },
};

// Reverse mapping: code → uniform property name
const hpcStatus: Record<string, Record<string, Record<string, string>>> = {
  job: {
    key: {
      '1001': 'name', '1002': 'jobId', '1003': 'username', '1005': 'status',
      '1008': 'comment', '100101': 'errorPath', '100102': 'outputPath',
      '10015': 'priority', '100204': 'walltime', '100227': 'workdir',
      '100229': 'queue', '10041': 'creationtime', '10042': 'modifiedtime',
      '10043': 'queuedtime', '10044': 'eligibletime', '10045': 'starttime',
      '10046': 'elapsedtime', '10047': 'remainingtime', '10025': 'procs',
    },
    value: {
      '10051': 'Completed', '10052': 'Exiting', '10053': 'Held',
      '10054': 'Queued', '10055': 'Running', '10056': 'Moving',
      '10057': 'Waiting', '10058': 'Suspended', '10059': 'Failed',
      '100510': 'Canceled', '100511': 'Begun', '100512': 'Expired',
      '100513': 'Moved', '100514': 'User-Suspended', '100515': 'Configuring',
    },
  },
  node: {
    key: {
      '2001': 'name', '2002': 'state', '2006': 'procs',
      '20020': 'totalProcs', '2004004': 'busyProcs',
      '20024': 'totMem', '200123': 'availMem', '200124': 'totalMem',
      '2004002': 'busyMem',
    },
    value: {
      '2105': 'active', '21051': 'busy', '21052': 'down', '21053': 'free',
      '21054': 'job-exclusive', '21055': 'jobsharing', '21056': 'offline',
      '21057': 'reserve', '21058': 'timeshared', '21059': 'unknown',
      '21060': 'stale', '21064': 'job-busy', '21065': 'mixed',
    },
  },
  queue: {
    key: { '3001': 'name' },
    value: { '2105': 'active' },
  },
};

function cleanProp(prop: string): string {
  return prop.replace(/[^0-9A-Za-z_.]/g, '').toLowerCase();
}

function getKey(hpc: string, type: string, prop: string, input: string, parent?: string): number | undefined {
  const codes = hpcCodes[hpc]?.[type]?.[prop];
  if (!codes) return undefined;
  if (parent) {
    return codes[cleanProp(parent) + '.' + cleanProp(input)];
  }
  return codes[cleanProp(input)];
}

const unitMemRegex = /([0-9]+)[a-zA-Z]{2}/;

function parseMem(nodeMem: string | number): number {
  const memStr = String(nodeMem);
  if (memStr.match(unitMemRegex)) {
    return parseInt(String(parseInt(memStr.substring(0, memStr.length - 2)) * 0.000001), 10);
  }
  return parseInt(String(Number(memStr) * 0.001), 10);
}

// ---- Time utilities ----

/** [D-][HH:]MM:SS (PBS and Slurm) → seconds; undefined for UNLIMITED etc. */
function parseTime(jobTime: string): number | undefined {
  const m = String(jobTime).match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/);
  if (!m) return undefined;
  return ((Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0)) * 60 + Number(m[3])) * 60 + Number(m[4]);
}

function toHHMMSS(secTime: number): string {
  const sec_num = parseInt(String(secTime), 10);
  const hours = Math.floor(sec_num / 3600);
  const minutes = Math.floor((sec_num - hours * 3600) / 60);
  const seconds = sec_num - hours * 3600 - minutes * 60;
  return `${hours < 10 ? '0' : ''}${hours}:${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

function computeRemainingTime(job: any): void {
  if (job.status === 'Running' && job.elapsedtime && job.walltime) {
    job.walltimeSec = parseTime(job.walltime);
    job.elapsedtimeSec = parseTime(job.elapsedtime);
    if (job.walltimeSec !== undefined && job.elapsedtimeSec !== undefined) {
      job.remainingtimeSec = job.walltimeSec - job.elapsedtimeSec;
      job.remainingtime = toHHMMSS(job.remainingtimeSec);
      job.jobProgress = Math.floor((job.elapsedtimeSec / job.walltimeSec) * 100);
    }
  }
}

function createShortId(jobId: string): number | null {
  const m = jobId.match(/^([0-9]+)\..+/);
  return m ? Number(m[1]) : null;
}

// ---- Transform object ----

function transformObjectFields(hpc: string, type: string, inputObject: any): any {
  const result = JSON.parse(JSON.stringify(inputObject), function (k, v) {
    const codeKey = getKey(hpc, type, 'key', k);
    if (codeKey !== undefined) {
      // Node and Job state codes
      if (codeKey === 2002 || codeKey === 1005) {
        let val = String(v);
        if (val.indexOf('+') > -1) val = val.split('+')[0];
        if (val.indexOf('*') > -1) val = val.substring(0, val.length - 1);
        const valCode = getKey(hpc, type, 'value', val);
        if (valCode !== undefined) {
          v = hpcStatus[type]?.value?.[String(valCode)] || v;
        }
      }
      // Date fields
      if (type === 'job' && [10041, 10042, 10043, 10044, 10045].includes(codeKey)) {
        v = new Date(v);
      }
      const newKey = hpcStatus[type]?.key?.[String(codeKey)];
      if (newKey === undefined) return v;
      if (k === newKey) return v;
      this[newKey] = v;
      return undefined;
    }
    return v;
  });
  return result;
}

// ---- Post-processing ----

/** PBS "alice@server" and Slurm scontrol "alice(2001)" → "alice". */
function cleanUsername(hpc: string, job: any): void {
  if (typeof job.username !== 'string') return;
  job.username = hpc === 'pbs' ? job.username.split('@')[0] : job.username.replace(/\(\d+\)$/, '');
}

function parseJobStatus(hpc: string, data: any): any {
  if (Array.isArray(data)) {
    for (const job of data) {
      cleanUsername(hpc, job);
      job.shortJobId = hpc === 'pbs' ? createShortId(job.jobId) : job.jobId;
      computeRemainingTime(job);
    }
    return data;
  }
  cleanUsername(hpc, data);
  data.shortJobId = hpc === 'pbs' ? createShortId(data.jobId) : data.jobId;
  computeRemainingTime(data);
  return data;
}

function parseQueueStatus(hpc: string, data: any): any {
  if (hpc === 'pbs' && Array.isArray(data)) {
    for (const q of data) {
      if (q.name === 'workq') q.default = true;
    }
  }
  return data;
}

export interface ClusterStatus {
  globalMaxProcs: number;
  globalBusyProcs: number;
  globalFreeProcs: number;
  globalDownProcs: number;
  globalTotalProcs: number;
  globalBusyMem: number;
  globalAvailMem: number;
  globalTotMem: number;
  globalMaxMemPerProc: number;
  globalBusyProcsPerc: number;
  globalDownProcsPerc: number;
  globalBusyMemPerc: number;
}

export interface NodeListResult {
  status: ClusterStatus;
  nodes: any[];
  jobs: string[];
  config: any;
}

function parseNodeConfig(hpc: string, data: any[]): any {
  const config = getConfig();
  if (config.hpcGlobalConfig.cluster_config) return data;

  let globalTotMem = 0;
  let globalTotalProcs = 0;
  let globalMaxProcs = 0;
  let maxMemPerProc = Infinity;
  const cluster_config: any = { gpus: {}, nodes: {} };

  for (const node of data) {
    const nodeInfo: any = {};

    // Memory
    if (!node.totMem) node.totMem = node.totalMem;
    if (typeof node.totMem === 'string') {
      node.totMem = node.totMem.match(unitMemRegex)
        ? parseInt(String(parseInt(node.totMem.substring(0, node.totMem.length - 2)) * 0.000001), 10)
        : parseInt(String(Number(node.totMem) * 0.001), 10);
    }
    nodeInfo.totMem = node.totMem;
    globalTotMem += nodeInfo.totMem;

    // Procs
    nodeInfo.totalProcs = parseInt(node.totalProcs, 10);
    globalTotalProcs += nodeInfo.totalProcs;
    globalMaxProcs = Math.max(globalMaxProcs, nodeInfo.totalProcs);
    nodeInfo.maxMemPerProc = Math.floor(nodeInfo.totMem / nodeInfo.totalProcs);
    maxMemPerProc = Math.min(maxMemPerProc, nodeInfo.maxMemPerProc);

    // SLURM-specific: features and GPUs
    if (hpc === 'slurm') {
      if (node.AvailableFeatures) {
        nodeInfo.features = node.AvailableFeatures.split(',');
      }
      if (node.Gres) {
        const gresList = node.Gres.split(',');
        for (const gres of gresList) {
          const parts = gres.split(':');
          if (parts[0] === 'gpu' && parts.length >= 3) {
            const model = parts[1];
            const count = parseInt(parts[2].match(/[0-9]+/)?.[0] || '0', 10);
            nodeInfo.gpu = nodeInfo.gpu || [];
            nodeInfo.gpu.push({ model, count });
            cluster_config.gpus[model] = (cluster_config.gpus[model] || 0) + count;
          }
        }
      }
    }

    cluster_config.nodes[node.name] = nodeInfo;
  }

  cluster_config.globalTotalProcs = globalTotalProcs;
  cluster_config.globalMaxProcs = globalMaxProcs;
  cluster_config.globalTotMem = globalTotMem;
  cluster_config.maxMemPerProc = maxMemPerProc === Infinity ? 0 : maxMemPerProc;

  // Cache the config
  config.hpcGlobalConfig.cluster_config = cluster_config;

  return data;
}

function parseNodeStatus(hpc: string, data: any[]): NodeListResult {
  const config = getConfig();
  const cluster_config = config.hpcGlobalConfig.cluster_config;

  let globalBusyProcs = 0;
  let globalFreeProcs = 0;
  let globalDownProcs = 0;
  let globalBusyMem = 0;
  let globalAvailMem = 0;
  const jobs: string[] = [];

  for (const nodeInfo of data) {
    const nodeConf = cluster_config.nodes[nodeInfo.name];
    if (!nodeConf) continue;

    const nodeMem = nodeConf.totMem;
    const nodeProcs = nodeConf.totalProcs;

    // CPU
    let getBusyProcs = true;
    if (nodeInfo.busyProcs) {
      nodeInfo.busyProcs = parseInt(nodeInfo.busyProcs, 10);
      getBusyProcs = false;
    } else {
      nodeInfo.busyProcs = 0;
    }

    // Jobs
    nodeInfo.runningJobs = '';
    if (nodeInfo.jobs && Array.isArray(nodeInfo.jobs)) {
      for (const job of nodeInfo.jobs) {
        if (jobs.indexOf(job.jobId) === -1) jobs.push(job.jobId);
        nodeInfo.runningJobs += `${job.jobId}(${job.jobProcs}), `;
        const procs = String(job.jobProcs);
        if (procs.indexOf('-') !== -1) {
          const range = procs.split('-');
          job.jobProcNb = parseInt(range[1]) - parseInt(range[0]) + 1;
          if (getBusyProcs) nodeInfo.busyProcs += job.jobProcNb;
        } else {
          job.jobProcNb = procs.split(',').length;
          if (getBusyProcs) nodeInfo.busyProcs++;
        }
      }
    }

    if (nodeInfo.state === 'down') {
      nodeInfo.freeProcs = 0;
      globalDownProcs += nodeProcs;
    } else {
      nodeInfo.freeProcs = nodeProcs - nodeInfo.busyProcs;
      nodeInfo.busyProcPerc = Math.floor((nodeInfo.busyProcs * 100) / nodeProcs);
      globalBusyProcs += nodeInfo.busyProcs;
      globalFreeProcs += nodeInfo.freeProcs;
    }

    // Memory
    if (nodeMem) {
      nodeInfo.totMem = nodeMem;
      if (nodeInfo.busyMem) {
        nodeInfo.busyMem = parseMem(nodeInfo.busyMem);
        nodeInfo.availMem = nodeMem - nodeInfo.busyMem;
      } else if (nodeInfo.availMem) {
        nodeInfo.availMem = parseMem(nodeInfo.availMem);
        nodeInfo.busyMem = nodeMem - nodeInfo.availMem;
      }
      if (nodeInfo.busyMem) {
        nodeInfo.busyMemPerc = Math.floor((nodeInfo.busyMem * 100) / nodeMem);
        globalBusyMem += nodeInfo.busyMem;
      }
      if (nodeInfo.availMem) {
        globalAvailMem += nodeInfo.availMem;
      }
    }
  }

  return {
    status: {
      globalMaxProcs: cluster_config.globalMaxProcs,
      globalBusyProcs,
      globalFreeProcs,
      globalDownProcs,
      globalTotalProcs: cluster_config.globalTotalProcs,
      globalBusyMem,
      globalAvailMem,
      globalTotMem: cluster_config.globalTotMem,
      globalMaxMemPerProc: cluster_config.maxMemPerProc,
      globalBusyProcsPerc: Math.floor((100 * globalBusyProcs) / cluster_config.globalTotalProcs),
      globalDownProcsPerc: Math.floor((100 * globalDownProcs) / cluster_config.globalTotalProcs),
      globalBusyMemPerc: Math.floor((100 * globalBusyMem) / cluster_config.globalTotMem),
    },
    nodes: data,
    jobs,
    config: cluster_config,
  };
}

// ---- Main export ----

export type HpcType = 'job' | 'node' | 'queue';

export function hpcFormatter(hpc: string, type: HpcType, inputData: any): any {
  // Transform fields using the dictionary
  const transformed = transformObjectFields(hpc, type, inputData);

  // Post-processing
  switch (type) {
    case 'job':
      return parseJobStatus(hpc, transformed);
    case 'queue':
      return parseQueueStatus(hpc, transformed);
    case 'node': {
      const parsed = parseNodeConfig(hpc, transformed);
      return parseNodeStatus(hpc, parsed);
    }
  }
}
