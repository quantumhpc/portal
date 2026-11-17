/**
 * File Operations Module
 * Handles file browsing, read/write, copy/move/delete, uploads.
 * Ported from libs/datajs.js (software mode only, no S3/cloud)
 *
 * Every operation on a user-supplied path runs as the user (see as-user.ts),
 * so the kernel enforces permissions. Never touch such paths with `fs` here.
 */

import path from 'path';
import fs from 'fs';
import { getConfig } from '@/lib/config';
import type { AuthenticatedUser as UserDocument } from '@/lib/db/models/user';
import { asUser, type UserStat } from './as-user';

const config = getConfig();
const uploadFolder = path.join(config.mainConfig.tmpdir, 'uploads');

try { fs.mkdirSync(uploadFolder, { recursive: true }); } catch {}

// Hidden file filter (Unix)
const regExFilter = /(^|\/)\.[^/.]/g;

/** Run as the user; turn permission errors into `message`. */
function run<T>(fn: () => T, message: string): T {
  try {
    return fn();
  } catch (err: any) {
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      throw Object.assign(new Error(message), { code: err.code });
    }
    throw err;
  }
}

// ---- Size conversion ----

function convertSize(bytes: number, units: string, precision = 0): number {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = sizes.indexOf(units);
  return Math.round(bytes * Math.pow(10, precision) / Math.pow(1024, i)) / Math.pow(10, precision);
}

// ---- Tree operations ----

interface TreeNode {
  id: string;
  text: string;
  data: { size: string; date: Date };
  icon: string;
  uid: number;
  gid: number;
  size: number;
  state: { opened: boolean; disabled: boolean; selected: boolean };
  li_attr: Record<string, any>;
  parent: string;
  children?: boolean;
}

function createTreeNode(
  user: UserDocument,
  nodePath: string,
  stats: UserStat,
  readable: boolean,
  opts: { root?: string | false; parent: string; ajax?: boolean }
): TreeNode {
  const isDir = stats.isDir;
  const node: TreeNode = {
    id: path.normalize(nodePath + (isDir ? path.sep : '')),
    text: opts.root || path.basename(nodePath),
    data: {
      size: !isDir ? convertSize(stats.size, 'KB') + ' KB' : '',
      date: new Date(stats.mtimeMs),
    },
    icon: isDir ? 'fa fa-folder' : 'fa fa-file',
    uid: stats.uid,
    gid: stats.gid,
    size: stats.size,
    state: {
      opened: false,
      disabled: !readable,
      selected: !!opts.root,
    },
    li_attr: {
      root: !!opts.root,
      base: path.basename(nodePath),
      isLeaf: !isDir,
      class: isDir ? 'folder' : 'file colored',
    },
    parent: opts.parent,
  };

  if (opts.ajax) {
    node.children = isDir && !opts.root;
  }

  // Disk usage for root nodes
  if (opts.root) {
    try {
      const statfs = asUser(user.system, 'statfs', nodePath);
      const total = statfs.bsize * statfs.blocks;
      const free = statfs.bsize * statfs.bfree;
      const busy = total - free;
      node.li_attr.space = {
        free: convertSize(free, 'GB', 1),
        total: convertSize(total, 'GB', 1),
        busy: convertSize(busy, 'GB', 1),
        busyPerc: Math.floor(busy / total * 100),
      };
    } catch {}
  }

  return node;
}

function processDirectory(
  user: UserDocument,
  folder: string,
  opts: { root?: string | false; parent?: string; ajax?: boolean }
): TreeNode[] {
  const resp: TreeNode[] = [];
  const list = asUser(user.system, 'list', folder).filter(item => !item.name.match(regExFilter));

  if (opts.root) {
    const stats = asUser(user.system, 'stat', folder);
    resp.push(createTreeNode(user, folder, stats, true, { ...opts, parent: '#' }));
  }

  const encParent = path.normalize(folder + path.sep);
  for (const item of list) {
    resp.push(createTreeNode(user, path.join(folder, item.name), item.stat, item.readable, { root: false, parent: encParent, ajax: opts.ajax }));
  }

  return resp;
}

function isRelative(parent: string, dir: string): boolean {
  const relative = path.relative(parent, dir);
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** Get directory tree (jsTree-compatible) */
export function getTree(
  user: UserDocument,
  folderTree: string,
  id: string | null,
  rootName: string,
  opts: { folder?: string } = {}
): TreeNode[] {
  if (!id) return [];

  let folder: string;
  const treeOpts: any = { ajax: true };

  if (id === '1' || id === 1 as any) {
    treeOpts.root = rootName;
    if (opts.folder) {
      if (isRelative(folderTree, opts.folder)) {
        folderTree = opts.folder;
        treeOpts.root = path.basename(opts.folder);
      } else {
        throw new Error(opts.folder + ' is not part of the working directory');
      }
    }
    folder = folderTree;
  } else {
    folder = id;
  }

  try {
    return processDirectory(user, folder, treeOpts);
  } catch (err: any) {
    if (err.code !== 'EACCES' && err.code !== 'EPERM') throw err;
    return [{ id: 'disabled', text: 'You are not authorized', data: { size: '', date: new Date() }, icon: 'jstree-file', uid: 0, gid: 0, size: 0, state: { opened: false, disabled: true, selected: false }, li_attr: { isLeaf: true, base: '', class: 'file' }, parent: '#' }];
  }
}

// ---- File content operations ----

export interface FileContent {
  content: string;
  resource: string;
  stats: UserStat;
  partial: boolean;
  firstChar: number;
  lastChar: number;
}

const MAX_TEXT_BYTES = 2 * 1000000;

/** Read file content */
export function getContent(
  user: UserDocument,
  resource: string,
  partials?: { from?: number; full?: boolean }
): FileContent | { content: string } | { raw: true; mimetype: string } {
  // Check for binary files
  if (isBinaryPath(resource)) {
    const mimetype = getMimeType(resource);
    if (!mimetype || mimetype.indexOf('image') === -1) throw new Error('File type not supported');
    if (!asUser(user.system, 'access', resource, fs.constants.R_OK)) throw new Error('You are not authorized');
    return { raw: true, mimetype } as any;
  }

  const read = run(() => asUser(user.system, 'read', resource, 'utf8', MAX_TEXT_BYTES), 'You are not authorized');
  const stats = read.stat;
  if (read.tooBig) {
    return { content: 'File is too big.' };
  }
  const data = read.data!;

  // Base64 encoded image
  if (data.startsWith('data:image')) {
    return { content: data };
  }

  let content: string;
  let partial = false;
  let firstChar = 0;
  let lastChar: number;

  if (partials?.full) {
    content = data;
    lastChar = stats.size;
  } else {
    const buffSize = 3000;
    if (data.length < buffSize || data.length - buffSize < 100) {
      content = data;
      lastChar = stats.size;
    } else {
      if (partials?.from) firstChar = Number(partials.from);
      lastChar = Math.min(firstChar + buffSize, stats.size);
      content = data.slice(firstChar, lastChar);
      partial = true;
    }
  }

  return { content, resource, stats, partial, firstChar, lastChar };
}

/** Read a raw (binary) file as the user. */
export function getRawContent(user: UserDocument, resource: string): Buffer {
  const read = run(() => asUser(user.system, 'read', resource, 'base64'), 'You are not authorized');
  return Buffer.from(read.data!, 'base64');
}

/** Write content to a file */
export function writeContent(
  user: UserDocument,
  resource: string,
  content: string,
  partials?: { from?: number; to?: number }
): void {
  let newContent = content;
  if (partials?.from !== undefined && partials?.to !== undefined) {
    const fileResult = getContent(user, resource, { full: true }) as FileContent;
    newContent = content + (fileResult.content || '').slice(Number(partials.to));
  }
  run(() => asUser(user.system, 'write', resource, newContent), 'You are not authorized');
}

// ---- Directory operations ----

/** Create a new directory */
export function createDirectory(
  user: UserDocument,
  directory: string,
  newFolderName: string
): string {
  const folderToCreate = path.join(directory, newFolderName, path.sep);
  run(() => asUser(user.system, 'mkdir', folderToCreate), 'You are not authorized');
  return folderToCreate;
}

/** Delete a file or directory */
export function deleteFile(
  user: UserDocument,
  file: string,
  force: boolean
): string {
  run(() => asUser(user.system, 'rm', file, force), 'You are not authorized to delete this file');
  return file;
}

/** Move or copy a file */
export function moveFile(
  user: UserDocument,
  from: string,
  to: string,
  move: boolean
): string {
  const stats = asUser(user.system, 'stat', to);
  if (!stats.isDir) throw new Error('The destination is not a valid directory.');

  const destinationFile = path.join(to, path.basename(from));
  run(() => asUser(user.system, move ? 'move' : 'copy', from, destinationFile), 'You are not authorized to move this file');
  return path.basename(from);
}

/** Rename a file */
export function renameFile(
  user: UserDocument,
  from: string,
  newName: string
): string {
  const destinationFile = path.join(path.dirname(from), newName);
  run(() => asUser(user.system, 'rename', from, destinationFile), 'You are not authorized to move this file');
  return destinationFile;
}

// ---- Download ----

/** Check if a file exists and is accessible */
export function fileExists(user: UserDocument, file: string): boolean {
  return asUser(user.system, 'access', file, fs.constants.R_OK);
}

/** Get file stats for download (checks auth) */
export function getDownloadInfo(user: UserDocument, file: string): { isDirectory: boolean; path: string } {
  if (!asUser(user.system, 'access', file, fs.constants.R_OK)) throw new Error('Not authorized');
  const stats = asUser(user.system, 'stat', file);
  return { isDirectory: stats.isDir, path: file };
}

// ---- Upload ----

/** Get or create the upload folder for a user */
export function getUploadFolder(user: UserDocument): string {
  const dest = path.join(uploadFolder, user._id.toString());
  try {
    fs.mkdirSync(dest, { recursive: true });
    if (process.platform !== 'win32') {
      fs.chownSync(dest, user.system.uid, user.system.gid);
      fs.chmodSync(dest, '0700');
    }
  } catch {}
  return dest;
}

// ---- Helpers ----

function isBinaryPath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const binaryExts = ['.bin', '.exe', '.dll', '.so', '.dylib', '.o', '.a', '.obj',
    '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar', '.xz',
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.tiff', '.webp',
    '.mp3', '.mp4', '.avi', '.mkv', '.mov', '.flac', '.wav',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.woff', '.woff2', '.ttf', '.eot', '.otf'];
  return binaryExts.includes(ext);
}

function getMimeType(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.bmp': 'image/bmp', '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml', '.webp': 'image/webp', '.tiff': 'image/tiff',
  };
  return mimeMap[ext] || null;
}
