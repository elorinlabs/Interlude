import { displayText } from '../../i18n/uiText';
import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { uiText } from "../../i18n/uiText";
import { cliDownloadLinks, importCliPackage, type CliDownloadLinks, type CliSnapshot } from "./cliManualDownloadApi";

export function useCliManualDownload(version: string | null, onImported: (value: CliSnapshot) => Promise<void>) {
  const [links, setLinks] = useState<CliDownloadLinks | null>(null);
  const [packagePath, setPackagePath] = useState("");
  const [metadataPath, setMetadataPath] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<CliSnapshot | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    void cliDownloadLinks(version).then(value => { if (!cancelled) setLinks(value); })
      .catch(() => { if (!cancelled) setError(uiText("client.cliImport.unableToPrepareDownloadLinksCloseThisWindowAndTry")); });
    return () => { cancelled = true; };
  }, [version]);

  const choose = async (kind: "package" | "metadata") => {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    try {
      const selected = await open({ multiple: false, directory: false,
        title: uiText(kind === "package" ? "client.cliImport.selectTheCompletePackage" : "client.cliImport.selectTheReleaseVerificationFile"),
      });
      if (typeof selected === "string" && mounted.current) {
        (kind === "package" ? setPackagePath : setMetadataPath)(selected);
        setError(""); setResult(null);
      }
    } catch { if (mounted.current) setError(uiText("client.cliImport.unableToSelectAFilePleaseTryAgain")); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  };

  const importFiles = async () => {
    if (locked.current || !packagePath) return;
    locked.current = true; setBusy(true); setImporting(true); setError(""); setResult(null);
    try {
      const imported = await importCliPackage({ packagePath, ...(metadataPath ? { metadataPath } : {}) });
      await onImported(imported);
      if (mounted.current) setResult(imported);
    } catch (cause) {
      if (mounted.current) setError(typeof cause === "string" ? displayText(cause)
        : uiText("client.cliImport.importFailedCheckThatTheSelectedFilesFinishedDownloadingAnd"));
    } finally {
      locked.current = false;
      if (mounted.current) { setBusy(false); setImporting(false); }
    }
  };
  const clearMetadata = () => {
    if (locked.current) return;
    setMetadataPath(""); setError(""); setResult(null);
  };
  return { links, packagePath, metadataPath, error, busy, importing, result, choose, clearMetadata, importFiles };
}
