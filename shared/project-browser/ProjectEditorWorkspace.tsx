import { useEffect, useRef } from 'react';
import { editorLayoutFrames, minimumEditorSize } from './editorLayout';
import { EditorDivider } from './EditorDivider';
import { ProjectEditorPane, type EditorPaneOptions } from './ProjectEditorPane';

export function ProjectEditorWorkspace({ options, narrow }: { options: EditorPaneOptions; narrow: boolean }) {
  const element = useRef<HTMLDivElement>(null);
  const activeGroup = options.store.getSnapshot().activeGroupId;
  useEffect(() => {
    const pane = element.current?.querySelector<HTMLElement>('.pf-editor-pane[data-active=true]');
    if (pane && !pane.contains(document.activeElement)) {
      pane.querySelector<HTMLButtonElement>('[role=tab][aria-selected=true]')?.focus();
    }
  }, [activeGroup]);
  const layout = options.store.getSnapshot().layout;
  const frames = editorLayoutFrames(layout, narrow);
  const minimum = minimumEditorSize(layout, narrow);
  return <div className="pf-editor-scroll">
    <div ref={element} className="pf-editor-layout" style={{ minWidth: minimum.width, minHeight: minimum.height }}>
      {frames.groups.map(({ group, frame }) => <ProjectEditorPane key={group.id}
        group={group} frame={frame} options={options} />)}
      {frames.dividers.map(divider => <EditorDivider key={divider.split.id} divider={divider}
        resize={options.store.resizeSplit} t={options.t} />)}
    </div>
  </div>;
}
