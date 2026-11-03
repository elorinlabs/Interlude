import canonicalCopy from '@interlude/i18n/copy/client/gitNotices';
import type { GitAction, GitRepository } from './gitTypes';

export function gitSyncCounts(repository: GitRepository | null): Partial<Record<GitAction, number>> {
  if (!repository?.upstream) return {};
  return { pull: repository.behind, push: repository.ahead };
}

export const GIT_ACTIONS: { action: Exclude<GitAction, 'switch'>; label: string; hint: string }[] = [
  { action: 'fetch', label: "client.git.fetch", hint: "client.git.fetchAllRemotesWithoutChangingLocalFiles" },
  { action: 'pull', label: "client.git.pull", hint: "client.git.fetchTheTrackedBranchAndIntegrateItIntoTheCurrent" },
  { action: 'update', label: "client.git.updateProject", hint: "client.git.fetchRemoteUpdatesThenAutomaticallyMergeAndCommitIfThere" },
  { action: 'push', label: "client.git.push", hint: "client.git.pushCommitsFromTheCurrentBranchToItsTrackedBranch" },
];
export const GIT_ACTION_NOTICE: Record<GitAction, string> = canonicalCopy;
