import { shell } from "electron";
import { normalizeExternalUrl } from "./externalUrlPolicy";

export async function openExternalUrl(input: unknown): Promise<{ opened: true }> {
  await shell.openExternal(normalizeExternalUrl(input));

  return { opened: true };
}
