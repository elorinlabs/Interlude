import { isDirty, type DocumentTab } from './documents';

export type CloseTabCommand = 'close' | 'closeOthers' | 'closeAll' | 'closeUnmodified' | 'closeRight';
export type TabCommand = CloseTabCommand | 'copyPath' | 'rename'
  | 'splitRight' | 'moveRight' | 'splitDown' | 'moveDown';
export interface TabTarget { groupId: string; path: string }
export interface TabMenuTarget extends TabTarget { x: number; y: number }

export function tabsToClose(tabs: DocumentTab[], path: string, command: CloseTabCommand) {
  const index = tabs.findIndex(tab => tab.path === path);
  if (index === -1) return [];
  return tabs.filter((tab, position) => {
    if (command === 'close') return tab.path === path;
    if (command === 'closeOthers') return tab.path !== path;
    if (command === 'closeUnmodified') return !isDirty(tab) && !tab.saving;
    if (command === 'closeRight') return position > index;
    return true;
  }).map(tab => tab.path);
}
