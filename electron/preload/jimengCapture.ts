import { ipcRenderer } from "electron";

const TARGET_PATH = "/mweb/v1/get_item_info";
const CAPTURE_CHANNEL = "jimeng-capture:item-info";

function report(url: string, body: string): void {
  if (!body) {
    return;
  }
  try {
    ipcRenderer.send(CAPTURE_CHANNEL, { url, body });
  } catch {
  }
}

function isTargetUrl(url: string): boolean {
  return typeof url === "string" && url.includes(TARGET_PATH);
}

const originalFetch = window.fetch;
if (typeof originalFetch === "function") {
  window.fetch = function patchedFetch(
    this: unknown,
    ...args: Parameters<typeof fetch>
  ): ReturnType<typeof fetch> {
    return originalFetch.apply(this, args).then((response: Response) => {
      try {
        const input = args[0];
        const requestUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input instanceof Request
                ? input.url
                : response.url || "";
        const finalUrl = requestUrl || response.url || "";
        if (isTargetUrl(finalUrl)) {
          response
            .clone()
            .text()
            .then((text) => report(finalUrl, text))
            .catch(() => undefined);
        }
      } catch {
      }
      return response;
    });
  } as typeof fetch;
}

const OriginalXHR = window.XMLHttpRequest;
if (typeof OriginalXHR === "function") {
  function PatchedXHR(this: unknown): XMLHttpRequest {
    const xhr = new OriginalXHR();
    let requestUrl = "";
    const originalOpen = xhr.open;
    xhr.open = function open(
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ): void {
      requestUrl = typeof url === "string" ? url : url instanceof URL ? url.href : "";
      return Reflect.apply(originalOpen, this, [method, url, ...rest]);
    } as XMLHttpRequest["open"];
    xhr.addEventListener("load", () => {
      try {
        if (isTargetUrl(requestUrl) && typeof xhr.responseText === "string") {
          report(requestUrl, xhr.responseText);
        }
      } catch {
      }
    });
    return xhr;
  }
  PatchedXHR.prototype = OriginalXHR.prototype;
  window.XMLHttpRequest = PatchedXHR as unknown as typeof XMLHttpRequest;
}
