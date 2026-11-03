import { useEffect, useState } from "react";
import type { Provider } from "../../types";
import { parseRequestOptions } from "./providerRequestOptions";

export function useProviderRequestOptions(provider: Provider | null) {
  const [useFullUrl, setUseFullUrl] = useState(false);
  const [headers, setHeaders] = useState("");
  const [body, setBody] = useState("");
  useEffect(() => {
    const options = provider?.requestOptions;
    setUseFullUrl(options?.useFullUrl ?? false);
    setHeaders(options?.headers ? JSON.stringify(options.headers, null, 2) : "");
    setBody(options?.body ? JSON.stringify(options.body, null, 2) : "");
  }, [provider]);
  const parsed = parseRequestOptions({ useFullUrl, headers, body });
  return { useFullUrl, setUseFullUrl, headers, setHeaders, body, setBody, ...parsed };
}
