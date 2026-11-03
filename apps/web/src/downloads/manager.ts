import { DownloadPolicyError } from '../../../../shared/remote-chat/policy';
import { DownloadCancelled } from '../../../../shared/remote-chat/fileDownload';
import { BulkError } from '../../../../shared/remote-chat/bulkLimits';
import { normalizeFileError } from '../../../../shared/remote-chat/fileErrors';
import { canRetryDownload, DownloadRetry } from '../../../../shared/remote-chat/downloadRetry';
import { saveDownload } from './saveDownload';
import { openBrowserDownload, type DownloadOpener } from './openDownload';
import { shareBrowserDownload } from './shareDownload';
import type { AuthSession } from '../types';
import { deleteDownload, listDownloads, storeDownload } from './storage';
import { transferDownload } from './transfer';
import { monitorDownloadSpeed } from './downloadSpeed';
import type { DownloadConnection, DownloadSource, DownloadTask } from './types';
import { sshDownloadClient } from '../../../../shared/terminal/sshDownloadClient';

const MAX_ACTIVE_DOWNLOADS = 2;
const MAX_DOWNLOAD_RECORDS = 500;
export const downloadOwner = (session: Pick<AuthSession, 'baseUrl' | 'email'>) =>
  JSON.stringify([session.baseUrl, session.email.toLowerCase()]);

export class WebDownloadManager {
  private tasks: DownloadTask[] = [];
  private listeners = new Set<() => void>();
  private current?: DownloadConnection;
  private connections = new Map<DownloadConnection['files'], DownloadConnection>();
  private initialization?: Promise<void>;
  private failure = '';
  private flights = new Map<string, { controller: AbortController; done: Promise<void> }>();
  private readonly retries = new DownloadRetry();
  private readonly retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly paused = new Set<string>();
  snapshot = () => this.tasks;
  connection = () => this.current;
  connectionForFile = (files: DownloadConnection['files']) => this.connections.get(files);
  connectionForProjectBrowser = (client: NonNullable<DownloadConnection['projectBrowser']>) =>
    [...this.connections.values()].find(connection => connection.projectBrowser === client);
  connectionForGit = (git: NonNullable<DownloadConnection['git']>) =>
    [...this.connections.values()].find(connection => connection.git === git);
  connectionForSsh = (ssh: NonNullable<DownloadConnection['ssh']>) =>
    [...this.connections.values()].find(connection => connection.ssh === ssh);
  connectionForSource = (source: Pick<DownloadSource, 'owner' | 'deviceId'>) =>
    [...this.connections.values()].find(connection => connection.owner === source.owner
      && connection.deviceId === source.deviceId);
  error = () => this.failure;
  retryAttempt = (id: string) => this.retryTimers.has(id) ? this.retries.attempt(id) : 0;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit = () => { this.listeners.forEach(listener => listener()); };
  private update = (task: DownloadTask) => {
    this.tasks = this.tasks.map(current => current.id === task.id ? task : current);
    this.emit();
  };
  initialize = () => this.initialization ??= listDownloads().then(tasks => {
    this.tasks = tasks.map(task => ({ ...task, bytesPerSecond: undefined,
      status: ['queued', 'preparing', 'downloading', 'verifying'].includes(task.status) ? 'paused'
        : task.status === 'saving' ? 'ready' : task.status }));
    this.emit();
  }).catch(() => {
    this.failure = '无法读取下载记录，请检查浏览器存储空间后重试。';
    this.emit();
  });

  bind(connection: DownloadConnection) {
    this.connections.clear();
    this.register(connection);
  }
  /** Desktop workspaces retain independent connections while navigating between computers. */
  register(connection: DownloadConnection) {
    this.connections.set(connection.files, connection);
    this.current = connection;
    this.pauseDisconnected();
    this.emit();
    this.schedule();
  }
  private pauseDisconnected() {
    for (const task of this.tasks) {
      if (!this.connected(task)) {
        this.flights.get(task.id)?.controller.abort();
        if (this.retryTimers.has(task.id)) void this.pause(task.id).catch(() => this.storageFailed());
      }
    }
  }
  unbind(client: DownloadConnection['files']) {
    this.connections.delete(client);
    if (this.current?.files === client) this.current = [...this.connections.values()].at(-1);
    this.pauseDisconnected();
    this.emit();
  }
  private connected(task: DownloadTask) {
    return this.connectionForSource(task.source)?.ready;
  }
  async enqueue(source: DownloadSource) {
    await this.initialize();
    if (this.failure) throw new Error(this.failure);
    const existing = this.tasks.find(task => task.source.owner === source.owner
      && task.source.deviceId === source.deviceId && task.source.path === source.path
      && task.source.scope === source.scope && task.source.threadId === source.threadId
      && task.source.cwd === source.cwd
      && task.source.preview === source.preview
      && task.source.gitCommit === source.gitCommit
      && task.source.sshSessionId === source.sshSessionId
      && ['queued', 'preparing', 'downloading', 'verifying', 'saving', 'paused'].includes(task.status));
    if (existing) { await this.resume(existing.id); return existing.id; }
    if (this.tasks.length >= MAX_DOWNLOAD_RECORDS) throw new Error('下载记录已满，请删除不再需要的记录后重试。');
    const task: DownloadTask = { id: crypto.randomUUID(), source,
      name: source.path.split(/[\\/]/).pop() || 'download', status: 'queued',
      received: 0, size: 0, createdAt: Date.now(), message: '' };
    await storeDownload(task);
    this.tasks = [...this.tasks, task];
    this.emit(); this.schedule();
    return task.id;
  }
  async pause(id: string) {
    this.paused.add(id);
    this.clearRetry(id);
    const flight = this.flights.get(id);
    if (flight) { flight.controller.abort(); await flight.done; }
    const task = this.tasks.find(task => task.id === id);
    if (task && task.status === 'queued') {
      const paused: DownloadTask = { ...task, status: 'paused', message: '' };
      // Remove it from scheduling before yielding to storage or a finishing sibling download.
      this.update(paused);
      await storeDownload(paused);
    }
  }
  async resume(id: string) {
    const task = this.tasks.find(task => task.id === id);
    if (!task || this.flights.has(id) || ['completed', 'ready', 'saving'].includes(task.status)) return;
    this.clearRetry(id);
    this.paused.delete(id);
    await this.persist({ ...task, status: 'queued', message: '' });
    this.schedule();
  }
  async remove(id: string) {
    await this.pause(id);
    await deleteDownload(id);
    this.tasks = this.tasks.filter(task => task.id !== id);
    this.paused.delete(id);
    this.emit();
  }
  async save(id: string) {
    const task = this.tasks.find(task => task.id === id);
    if (!task || !['completed', 'ready'].includes(task.status)) return;
    // Invoke the picker in the click stack before an IndexedDB await consumes user activation.
    const saving = saveDownload(task, () => undefined);
    this.update({ ...task, status: 'saving', exported: true,
      message: task.status === 'completed' ? '' : task.message });
    try {
      const confirmed = await saving;
      await this.persist({ ...task, exported: true, status: confirmed ? 'completed' : 'ready',
        message: confirmed ? '已保存到设备' : '已开始保存，请在浏览器下载列表中确认。' });
    } catch (error) {
      const invalid = error instanceof BulkError && error.code === 'INTEGRITY_FAILED';
      await this.persist({ ...task, status: invalid ? 'failed' : 'ready', verified: invalid ? false : task.verified,
        message: invalid ? error.message : error instanceof DownloadCancelled ? ''
        : '保存未完成，文件仍已就绪，可再次保存。' });
      if (!(error instanceof DownloadCancelled)) throw error;
    }
  }
  async open(id: string, opener: DownloadOpener = openBrowserDownload) {
    const task = this.tasks.find(task => task.id === id);
    if (!task || !['completed', 'ready'].includes(task.status)) return;
    try { await opener(task); }
    catch (error) {
      if (error instanceof BulkError && error.code === 'INTEGRITY_FAILED') {
        await this.persist({ ...task, status: 'failed', verified: false, message: error.message });
      }
      throw error;
    }
  }
  share(id: string) { return this.open(id, shareBrowserDownload); }
  private async persist(task: DownloadTask) {
    await storeDownload(task);
    this.update(task);
  }
  private schedule() {
    if (this.failure) return;
    for (const task of this.tasks) {
      if (this.flights.size >= MAX_ACTIVE_DOWNLOADS) return;
      const connection = this.connectionForSource(task.source);
      if (task.status !== 'queued' || this.flights.has(task.id) || this.retryTimers.has(task.id) || this.paused.has(task.id)
        || !connection?.ready) continue;
      const controller = new AbortController();
      const done = Promise.resolve().then(() => this.run(task, connection, controller.signal)).finally(() => {
        this.flights.delete(task.id); this.schedule();
      });
      this.flights.set(task.id, { controller, done });
    }
  }
  private async run(task: DownloadTask, connection: DownloadConnection, signal: AbortSignal) {
    const speed = monitorDownloadSpeed(value => { task = value; this.update(value); });
    try {
      task = { ...task, status: 'preparing', preparation: undefined, completedAt: undefined };
      await this.persist(task);
      const client = task.source.sshSessionId ? connection.ssh
        && sshDownloadClient(connection.ssh, task.source.sshSessionId) : connection.client;
      if (!client) throw new Error('client.ssh.closed');
      await transferDownload({ task, client, signal,
        mode: () => this.connectionForSource(task.source)?.mode ?? 'offline',
        update: speed.update });
      speed.stop();
      this.clearRetry(task.id);
      await this.persist({ ...task, status: 'ready', bytesPerSecond: undefined,
        completedAt: Date.now() });
    } catch (error) {
      speed.stop();
      error = normalizeFileError(error);
      const paused = signal.aborted || error instanceof DownloadCancelled
        || (error instanceof BulkError && error.code === 'CANCELLED');
      const retrying = canRetryDownload(error) && !signal.aborted && !this.paused.has(task.id)
        && this.connected(task) && this.deferRetry(task);
      task = { ...task, status: retrying ? 'queued' : paused ? 'paused' : 'failed', bytesPerSecond: undefined,
        message: retrying ? '下载暂时中断，正在重试…' : signal.aborted ? ''
          : error instanceof DownloadPolicyError || error instanceof BulkError ? error.message
          : '下载未完成，请检查连接和存储空间后重试。' };
      this.update(task);
      await storeDownload(task).catch(() => {
        this.clearRetry(task.id); this.update({ ...task, status: 'failed' }); this.storageFailed();
      });
    } finally {
      speed.stop();
    }
  }
  private deferRetry(task: DownloadTask) {
    const delay = this.retries.next(task.id);
    if (delay === undefined) return false;
    this.retryTimers.set(task.id, setTimeout(() => { this.retryTimers.delete(task.id); this.schedule(); }, delay));
    return true;
  }
  private clearRetry(id: string) {
    clearTimeout(this.retryTimers.get(id)); this.retryTimers.delete(id); this.retries.clear(id);
  }
  private storageFailed() { this.failure = '无法保存下载进度，请检查浏览器存储空间。'; this.emit(); }
}

export const downloadManager = new WebDownloadManager();
