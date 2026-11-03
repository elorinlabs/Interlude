const POWERSHELL_WRAPPER = new RegExp(
  '^(?:"[^"\\r\\n]*[\\\\/](?:powershell|pwsh)(?:\\.exe)?"|(?:powershell|pwsh)(?:\\.exe)?)'
  + '(?:\\s+-(?:NoProfile|NoLogo|NonInteractive))*\\s+-(?:Command|c)\\s+([\\s\\S]+)$', 'i',
);

/** Shorten the displayed shell wrapper only; command details and copying always keep the original command. */
export function commandPreview(command: string) {
  const script = command.trim().match(POWERSHELL_WRAPPER)?.[1];
  if (!script) return command;
  const quote = script[0];
  if (quote !== '"' && quote !== "'") return script;
  // Older history may contain mixed shell quoting. Keep the script verbatim when its quote is unmatched.
  return script.endsWith(quote) ? script.slice(1, -1) : script;
}
