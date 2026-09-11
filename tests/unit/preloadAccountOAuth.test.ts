import { beforeEach, describe, expect, it, vi } from "vitest";
import { IpcChannelName } from "../../electron/shared/ipcChannels";
import type { SuyanApi } from "../../src/types/suyanApi";

const electronMock = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  send: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: electronMock.exposeInMainWorld },
  ipcRenderer: {
    invoke: electronMock.invoke,
    send: electronMock.send,
    on: electronMock.on,
    removeListener: electronMock.removeListener,
  },
}));

import "../../electron/preload/index";

const api = (): SuyanApi =>
  electronMock.exposeInMainWorld.mock.calls[0]?.[1] as SuyanApi;

describe("preload account OAuth bridge", () => {
  beforeEach(() => {
    electronMock.invoke.mockReset();
    electronMock.invoke.mockResolvedValue({ ok: true, data: {} });
  });

  it("透传登录 OAuth 的 prompt 和渠道", async () => {
    await api().accountStartOAuth("github", { prompt: "login" });

    expect(electronMock.invoke).toHaveBeenCalledWith(
      IpcChannelName.AccountStartOAuth,
      { provider: "github", prompt: "login" },
    );
  });

  it("透传绑定 OAuth 的 prompt 和渠道", async () => {
    await api().accountStartOAuthLink("google", { prompt: "login" });

    expect(electronMock.invoke).toHaveBeenCalledWith(
      IpcChannelName.AccountStartOAuthLink,
      { provider: "google", prompt: "login" },
    );
  });
});
