import type { ReactNode } from 'react';
import type { ProjectDocument } from './protocol';

/** Hosts opt in without bundling browser media engines into the offline native editor. */
export interface ProjectPreviewProps {
  document: ProjectDocument;
  text: string;
  active: boolean;
  connected: boolean;
  editor: ReactNode;
  openFile: (path: string) => void;
}
export type ProjectPreviewRenderer = (props: ProjectPreviewProps) => ReactNode;
