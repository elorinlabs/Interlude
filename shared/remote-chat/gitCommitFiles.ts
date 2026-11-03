const FILE_STATUS = {
  A: { label: "client.git.added", color: '#14785b', background: '#eaf7f0' },
  M: { label: "client.git.modified", color: '#2868b2', background: '#edf4ff' },
  D: { label: "client.projectBrowser.deleted", color: '#bf3945', background: '#fff0f1' },
  R: { label: "client.projectBrowser.renamed", color: '#8256b5', background: '#f5efff' },
  C: { label: "client.projectBrowser.copied", color: '#8256b5', background: '#f5efff' },
  T: { label: "client.git.typeChanged", color: '#9a6312', background: '#fff7e7' },
} as const;

export function commitFileStatus(status: string) {
  return FILE_STATUS[status as keyof typeof FILE_STATUS]
    ?? { label: "client.git.changed", color: '#718078', background: '#f2f5f3' };
}
