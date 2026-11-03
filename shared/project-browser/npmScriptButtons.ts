import { RangeSet, StateField, type EditorState } from '@codemirror/state';
import { EditorView, gutter, GutterMarker, ViewPlugin } from '@codemirror/view';
import { npmScriptEntries } from './npmScripts';
import './npmScriptButtons.css';

export interface ScriptButton {
  name: string; running: boolean; disabled: boolean; label: string; toggle: () => void;
}

class ScriptMarker extends GutterMarker {
  constructor(private button: ScriptButton) { super(); }
  eq(other: ScriptMarker) {
    return this.button.name === other.button.name && this.button.running === other.button.running
      && this.button.disabled === other.button.disabled && this.button.label === other.button.label;
  }
  toDOM() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pf-npm-script';
    button.dataset.running = String(this.button.running);
    button.dataset.script = this.button.name;
    button.disabled = this.button.disabled;
    button.setAttribute('aria-label', this.button.label);
    const tooltip = document.createElement('span');
    tooltip.className = 'pf-npm-script-tooltip';
    tooltip.textContent = this.button.label;
    tooltip.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('aria-hidden', 'true');
    const shape = document.createElementNS(svg.namespaceURI, 'path');
    shape.setAttribute('d', this.button.running ? 'M5 5h10v10H5z' : 'M5 3.5 16 10 5 16.5z');
    svg.append(shape);
    button.append(svg, tooltip);
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); this.button.toggle(); });
    return button;
  }
}

export function npmScriptButtons(describe: (name: string) => ScriptButton) {
  const markers = (state: EditorState) => RangeSet.of(npmScriptEntries(state.doc.toString())
    .map(entry => new ScriptMarker(describe(entry.name)).range(state.doc.lineAt(entry.from).from)), true);
  const field = StateField.define({
    create: markers,
    update: (value, transaction) => transaction.docChanged ? markers(transaction.state) : value,
  });
  return [field, gutter({ class: 'pf-npm-gutter', markers: view => view.state.field(field) }), accessibleGutter];
}

// CodeMirror hides decorative gutters from assistive technology; this one contains real controls.
const accessibleGutter = ViewPlugin.fromClass(class {
  private root: HTMLElement | null;
  constructor(view: EditorView) {
    this.root = view.scrollDOM.querySelector('.cm-gutters-before');
    this.update();
  }
  update() {
    this.root?.removeAttribute('aria-hidden');
    this.root?.querySelectorAll('.cm-lineNumbers, .cm-foldGutter')
      .forEach(element => element.setAttribute('aria-hidden', 'true'));
  }
  destroy() {
    this.root?.setAttribute('aria-hidden', 'true');
    this.root?.querySelectorAll('.cm-lineNumbers, .cm-foldGutter')
      .forEach(element => element.removeAttribute('aria-hidden'));
  }
});
