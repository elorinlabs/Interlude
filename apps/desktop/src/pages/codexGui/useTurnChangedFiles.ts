import { useMemo } from "react";
import { changedFiles, parseDiff } from "./diff";
import type { Turn } from "./types";

export function useTurnChangedFiles(turn?: Turn) {
  const netFiles = useMemo(() => parseDiff(turn?.diff ?? ""), [turn?.diff]);
  return useMemo(() => turn?.diff ? netFiles : (turn?.items ?? [])
    .filter((item) => item.type === "fileChange" && !["declined", "failed", "inProgress"].includes(item.status ?? ""))
    .flatMap((item) => changedFiles(item.changes ?? [])), [turn?.diff, turn?.items, netFiles]);
}
