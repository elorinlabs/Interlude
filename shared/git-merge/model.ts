import type { GitConflict } from '../remote-chat/gitTypes';

export interface MergeRange { id: number; from: number; to: number; resolved: boolean }
export interface MergeBlock { id: number; left: string; right: string }
export interface MergeDocument { text: string; ranges: MergeRange[] }
export interface MergeModel {
  left: MergeDocument; right: MergeDocument; result: MergeDocument; blocks: MergeBlock[]; lineEnding: string;
}
interface Section { common?: string; left?: string; right?: string }

function sections(text: string, size: number): Section[] {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const marker = (line: string, char: string) => {
    const content = line.replace(/\n$/, '');
    return content === char.repeat(size) || content.startsWith(`${char.repeat(size)} `);
  };
  const output: Section[] = [];
  let common = '';
  for (let index = 0; index < lines.length; index += 1) {
    if (!marker(lines[index], '<')) { common += lines[index]; continue; }
    const start = index;
    let left = ''; let right = ''; let base = false;
    while (++index < lines.length && !marker(lines[index], '=')) {
      if (marker(lines[index], '|')) base = true;
      else if (!base) left += lines[index];
    }
    if (index === lines.length) return [{ common: text }];
    while (++index < lines.length && !marker(lines[index], '>')) right += lines[index];
    if (index === lines.length || index === start) return [{ common: text }];
    output.push({ common }, { left, right }); common = '';
  }
  output.push({ common });
  return output;
}

/** Parse merge/diff3/zdiff3 markers without trimming source whitespace or a missing final newline. */
export function createMergeModel(conflict: GitConflict): MergeModel {
  const normalize = (text: string | null) => (text ?? '').replace(/\r\n/g, '\n');
  const result = normalize(conflict.result);
  const parsed = sections(result, conflict.markerSize);
  const model: MergeModel = { left: { text: '', ranges: [] }, right: { text: '', ranges: [] },
    result: { text: '', ranges: [] }, blocks: [],
    lineEnding: (conflict.result ?? conflict.ours ?? conflict.theirs ?? '').includes('\r\n') ? '\r\n' : '\n' };
  const append = (doc: MergeDocument, text: string, id: number) => {
    doc.ranges.push({ id, from: doc.text.length, to: doc.text.length + text.length, resolved: false });
    doc.text += text;
  };
  for (const section of parsed) {
    if (section.common !== undefined) {
      for (const doc of [model.left, model.right, model.result]) doc.text += section.common;
      continue;
    }
    const id = model.blocks.length;
    const left = section.left ?? ''; const right = section.right ?? '';
    model.blocks.push({ id, left, right });
    append(model.left, left, id); append(model.right, right, id); append(model.result, left, id);
  }
  if (!model.blocks.length) {
    // Modify/delete and externally edited files may have no markers. Require an explicit whole-file decision.
    model.left = { text: '', ranges: [] }; model.right = { text: '', ranges: [] };
    model.result = { text: '', ranges: [] };
    const left = normalize(conflict.ours); const right = normalize(conflict.theirs);
    model.blocks.push({ id: 0, left, right });
    append(model.left, left, 0); append(model.right, right, 0); append(model.result, result, 0);
  }
  return model;
}

export function containsConflictMarkers(text: string, size: number) {
  return text.split(/\r?\n/).some(line => ['<', '|', '=', '>'].some(char =>
    line === char.repeat(size) || line.startsWith(`${char.repeat(size)} `)));
}
