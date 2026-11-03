import type { GitChange, GitResetMode } from './gitTypes';

export const GIT_LONG_PRESS_MS = 500;

export function gitFileMenuLabels(folder: boolean) {
  return {
    commit: folder ? "client.git.commitChangesInFolder" : "client.git.commitThisFile",
    rollback: folder ? "client.git.rollBackChangesInFolder" : "client.git.rollBackThisFile",
    delete: folder ? "client.git.deleteChangedFilesInFolder" : "client.git.deleteFile",
  };
}

export function deletableGitFiles(files: GitChange[]) {
  return files.filter(file => file.status[1] !== 'D' && file.status !== 'D ');
}

export const GIT_RESET_MODES: { value: GitResetMode; label: string; description: string }[] = [
  { value: 'soft', label: "client.git.keepChangesStagedSoft", description: "client.git.keepFilesAndTheIndexChangesFromRemovedCommitsStay" },
  { value: 'mixed', label: "client.git.keepChangesUnstagedMixed", description: "client.git.keepFilesAndLeaveDifferencesFromTheTargetCommitUnstaged" },
  { value: 'hard', label: "client.git.discardChangesHard",
    description: "client.git.restoreFilesAndTheIndexToThisCommitUncommittedChanges" },
  { value: 'keep', label: "client.git.keepUncommittedChangesKeep", description: "client.git.keepUncommittedChangesStopIfTheyConflictWithTheTarget" },
];
