/**
 * Job Database Operations
 * Manages job records in MongoDB - save, query, update, delete.
 * Ported from libs/jobs.js
 */

import path from 'path';
import { asUser, type FsUser } from '@/lib/files/as-user';
import { isTerminal } from '@/lib/hpc/status';
import { removeToken } from '@/lib/vnc/tokens';
import { getDb, ensureIndexes } from './connection';
import { resolveParser } from '@/lib/parsers';
import { completeLines } from '@/lib/parsers/lines';

const JOB_COLLECTION = 'jobs';
const MAX_JOBS = 20;

// Ensure indexes on startup
ensureIndexes(JOB_COLLECTION, {
  'jobInfo.userId': 1,
  'jobInfo.jobArgs.clusterUID': 1,
  'jobInfo.jobDate': -1,
  'server.status': 1,
});

function sanitizeKey(keyName: string): string {
  if (keyName.indexOf('\\') !== -1 || keyName.indexOf('$') !== -1 || keyName.indexOf('.') !== -1) {
    return keyName.replace('\\', '\\\\').replace('$', '\\u0024').replace('.', '\\u002e');
  }
  return keyName;
}

/** Get jobs submitted from the app by the user */
export async function getJobInfo(userId: string, jobId?: string | null): Promise<any[]> {
  const db = await getDb();
  const collection = db.collection(JOB_COLLECTION);

  const searchPattern: any = { 'jobInfo.userId': userId };

  if (jobId) {
    // Check if jobId is a clusterUID (UUID format)
    if (jobId.match(/([0-9a-z]{8}-[0-9a-z]{4}-4[0-9a-z]{3}-[0-9a-z]{4}-[0-9a-z]{12})([^a-zA-Z0-9]|$)/)) {
      searchPattern['jobInfo.jobArgs.clusterUID'] = jobId;
    } else {
      searchPattern.jobId = jobId;
    }
  }

  const jobList = await collection
    .find(searchPattern)
    .project({ 'jobInfo.postPross': 0 })
    .sort({ 'jobInfo.jobDate': -1 })
    .limit(MAX_JOBS)
    .toArray();

  // Normalize legacy fields
  for (const job of jobList) {
    if (job.jobInfo?.mountedOutputFile && !job.jobInfo.output) {
      job.jobInfo.output = { outputFile: job.jobInfo.mountedOutputFile };
    }
    if (job.status && !job.server) {
      job.server = job.status;
      delete job.status;
    }
    if (job.jobInfo?.localJobDir) {
      job.jobInfo.localJobDir = path.normalize(job.jobInfo.localJobDir + path.sep);
    }
    if (job.jobInfo?.mountedWorkingDir) {
      job.jobInfo.mountedWorkingDir = path.normalize(job.jobInfo.mountedWorkingDir + path.sep);
    }
  }

  return jobList;
}

/** Update a specific job */
export async function updateJob(
  userId: string,
  filters: { jobId?: string; clusterUID?: string; status?: string },
  update: any
): Promise<any> {
  const db = await getDb();
  const collection = db.collection(JOB_COLLECTION);

  const searchPattern: any = { 'jobInfo.userId': userId };
  if (filters.jobId) searchPattern.jobId = filters.jobId;
  if (filters.clusterUID) searchPattern['jobInfo.jobArgs.clusterUID'] = filters.clusterUID;
  if (filters.status) searchPattern['server.status'] = filters.status;

  const result = await collection.findOneAndUpdate(
    searchPattern,
    { $set: update },
    { returnDocument: 'after' }
  );

  return result;
}

/** Link an external HPC job to the portal */
export async function jobLink(
  user: any,
  jobWorkingDir: string,
  jobId: string,
  appDomain: string,
  appName: string,
  selectedFiles: Record<string, string>
): Promise<string> {
  // Dynamic import to avoid circular dependency
  const { getConfig } = await import('@/lib/config');
  const config = getConfig();
  const hpcGlobalConfig = config.hpcGlobalConfig;

  if (!hpcGlobalConfig.useSharedDir && hpcGlobalConfig.method !== 'local') {
    throw new Error('Job linking is not available without working directory access.');
  }

  const jobInfo: any = {
    jobId,
    jobDate: new Date(),
    userId: user._id.toString(),
    jobArgs: {
      appDomain,
      appName,
      useoutputFile: true,
      type: 'batch',
    },
  };

  jobInfo.mountedWorkingDir = jobWorkingDir;
  jobInfo.jobArgs.workdir = path.join(
    hpcGlobalConfig.workingDir,
    path.relative(hpcGlobalConfig.sharedDir, jobWorkingDir)
  );

  jobInfo.output = {};
  for (const key in selectedFiles) {
    try {
      jobInfo.jobArgs[key] = path.basename(selectedFiles[key]);
      jobInfo.output[key] = path.join(jobInfo.mountedWorkingDir, jobInfo.jobArgs[key]);
    } catch { /* ignore */ }
  }

  await saveJobInfo(jobId, jobInfo);
  return `Job ${jobId} has been successfully linked`;
}

/** Save a new job to the database */
export async function saveJobInfo(jobId: string, jobInfo: any): Promise<string> {
  const db = await getDb();
  const collection = db.collection(JOB_COLLECTION);

  await collection.insertOne({
    jobId,
    jobInfo,
    server: { status: 'New' },
  });

  return `${jobId} saved`;
}

/** Update job with remote server info */
export async function saveRemoteInfo(
  user: { system: FsUser },
  jobId: string,
  serverJobInfo: any,
  currentDbInfo: any
): Promise<any> {
  // Tweak to have info in both places
  if (currentDbInfo.jobInfo) {
    currentDbInfo.jobInfo.appDomain = currentDbInfo.jobInfo.jobArgs?.appDomain;
    currentDbInfo.jobInfo.appName = currentDbInfo.jobInfo.jobArgs?.appName;
  }

  // Parse residuals when job first completes
  if (
    serverJobInfo.status === 'Completed' &&
    currentDbInfo.server?.status !== serverJobInfo.status &&
    currentDbInfo.jobInfo?.jobArgs?.type === 'batch' &&
    !currentDbInfo.jobInfo?.parsed
  ) {
    return saveAndParseRemoteInfo(user, jobId, serverJobInfo, currentDbInfo);
  }

  // Remote jobs: the connection file appears once the desktop is up (any scheduler's
  // status sequence, so don't wait for a particular transition).
  const args = currentDbInfo.jobInfo?.jobArgs;
  if (args?.type === 'remote' && serverJobInfo.status === 'Running' && !args.connectionReady && args.connectionFile) {
    try {
      args.connectionReady = asUser(user.system, 'access', args.connectionFile, 0);
    } catch { /* ignore */ }
  }
  // Session over: stop routing its token.
  if (isTerminal(serverJobInfo.status) && currentDbInfo.jobInfo?.vnc) {
    removeToken(jobId);
    delete currentDbInfo.jobInfo.vnc;
  }

  const db = await getDb();
  const collection = db.collection(JOB_COLLECTION);

  const toInsert = currentDbInfo || {};
  toInsert.server = toInsert.server || {};

  for (const field in serverJobInfo) {
    toInsert.server[sanitizeKey(field)] = serverJobInfo[field];
  }

  // By _id: a scheduler can reuse a job id, so several records may share it.
  const result = await collection.findOneAndUpdate(
    toInsert._id ? { _id: toInsert._id } : { jobId: jobId.toString() },
    { $set: toInsert },
    { returnDocument: 'after' }
  );

  return result?.value || result;
}

/** Parse residuals and save */
export async function saveAndParseRemoteInfo(
  user: { system: FsUser },
  jobId: string,
  serverJobInfo: any,
  currentDbInfo: any
): Promise<any> {
  currentDbInfo.jobInfo = currentDbInfo.jobInfo || {};
  currentDbInfo.jobInfo.startLine = 0;
  currentDbInfo.jobInfo.startIter = 0;

  try {
    const data = await getJobResiduals(
      { ...user, _id: currentDbInfo.jobInfo.userId },
      jobId,
      currentDbInfo.jobInfo
    );
    currentDbInfo.jobInfo.postPross = data;
    currentDbInfo.jobInfo.parsed = true;
    delete currentDbInfo.jobInfo.outputFileContent;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      currentDbInfo.jobInfo.postPross = {
        step: { lastLine: 0, ended: true },
        graph: { data: [[0, 0]], label: 'Not available' },
      };
      currentDbInfo.jobInfo.parsed = true;
    } else {
      throw err;
    }
  }

  return saveRemoteInfo(user, jobId, serverJobInfo, currentDbInfo);
}

/** Delete job(s) from the database */
export async function deleteJobInfo(userId: string, jobId: string | string[]): Promise<string> {
  const ids = Array.isArray(jobId) ? jobId : [jobId];
  const db = await getDb();
  const collection = db.collection(JOB_COLLECTION);

  await collection.deleteMany({
    jobId: { $in: ids },
    'jobInfo.userId': userId,
  });

  return `${ids.join(', ')} deleted`;
}

/** Get the output file content for a job */
export async function getOutputFile(
  user: { _id: { toString(): string }; system: FsUser },
  jobId: string,
  jobInfo: any,
  residuals: boolean,
  requiredFile: string
): Promise<any> {
  const data = await getJobInfo(user._id.toString(), jobId);
  jobInfo = jobInfo || {};

  if (data[0]?.jobInfo?.output?.outputFile) {
    jobInfo.appDomain = data[0].jobInfo.jobArgs.appDomain;
    jobInfo.appName = data[0].jobInfo.jobArgs.appName;

    if (data[0].jobInfo.mountedWorkingDir) {
      jobInfo.mountedWorkingDir = data[0].jobInfo.mountedWorkingDir;
    }
    if (data[0].jobInfo.preProc) {
      jobInfo.preProc = data[0].jobInfo.preProc;
    }

    jobInfo.outputFile = data[0].jobInfo.output[requiredFile];

    // Return cached residuals if available
    if (residuals && data[0].jobInfo.postPross && data[0].jobInfo.parsed) {
      jobInfo.parsed = true;
      jobInfo.postPross = data[0].jobInfo.postPross;
      return jobInfo;
    }

    // Read output file
    if (jobInfo.outputFile) {
      try {
        // As the user: the output path comes from the job script, which the user controls.
        jobInfo.outputFileContent = asUser(user.system, 'read', jobInfo.outputFile, 'utf8').data;
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          err.message = 'The file does not exist';
        }
        throw err;
      }
    }
    return jobInfo;
  }

  jobInfo.outputFile = null;
  jobInfo.outputFileContent = 'No output has been defined.';
  return jobInfo;
}

/** Parse output file for residuals/convergence data */
export async function getJobResiduals(
  user: { _id: { toString(): string }; system: FsUser },
  jobId: string,
  jobInfo: any
): Promise<any> {
  const entry = resolveParser(jobInfo.appDomain, jobInfo.appName);
  if (!entry?.post) {
    return { noParser: true, step: { lastLine: 0, ended: true }, graph: [], markings: [] };
  }

  const requiredFile = entry.require || 'outputFile';
  const jobInfoWContent = await getOutputFile(user, jobId, jobInfo, true, requiredFile);

  if (!jobInfoWContent.outputFile) {
    return {
      step: { lastLine: 0, ended: true },
      graph: { data: [[0, 0]], label: jobInfoWContent.outputFileContent },
    };
  }

  if (jobInfoWContent.parsed) {
    return jobInfoWContent.postPross;
  }

  const preProc = jobInfoWContent.preProc || {};

  return new Promise((resolve, reject) => {
    try {
      entry.post!(
        completeLines(jobInfoWContent.outputFileContent),
        jobInfoWContent.startLine || 0,
        jobInfoWContent.startIter || 0,
        preProc,
        (err: Error | null, data: any) => {
          if (err) return reject(err);
          resolve(data);
        }
      );
    } catch (err) {
      reject(err);
    }
  });
}
