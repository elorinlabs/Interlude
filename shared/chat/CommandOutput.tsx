import { type ReactNode } from 'react';
import { CompletePlainText } from './CompletePlainText';
import './commandOutput.css';

interface Props {
  command: string;
  output: string;
  label: string;
  copyCommand: ReactNode;
  copyOutput: ReactNode;
}

/** Command and complete output share one bounded, keyboard-accessible scroll area. */
export function CommandOutput({ command, output, label, copyCommand, copyOutput }: Props) {
  return <section className="cs-command-output" role="region" aria-label={label} tabIndex={0}>
    <div className="cs-command-content">
      <div className="cs-command-input">
        <pre><span className="cs-command-prompt" aria-hidden="true">$ </span>
          <code><CompletePlainText text={command} /></code></pre>
        <div className="cs-command-copy">{copyCommand}</div>
      </div>
      <div className="cs-command-result">
        <pre><code><CompletePlainText text={output} /></code></pre>
        <div className="cs-command-copy">{copyOutput}</div>
      </div>
    </div>
  </section>;
}
