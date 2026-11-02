import { describe, expect, it, vi } from "vitest";
import type {
  UpscaleInputDescriptor,
  UpscaleJob,
  UpscaleResultDescriptor,
} from "../../src/features/upscale/types";
import {
  createUpscaleStore,
  type UpscaleStoreDependencies,
} from "../../src/features/upscale/store/useUpscaleStore";

function input(token: string): UpscaleInputDescriptor {
  return {
    token,
    displayName: `${token}.png`,
    width: 320,
    height: 180,
    byteSize: 128,
    mediaType: "image/png",
    sourceItemId: null,
    previewDataUrl: `data:image/png;base64,${token}`,
  };
}

function result(token: string): UpscaleResultDescriptor {
  return {
    token: `result-${token}`,
    previewDataUrl: `data:image/webp;base64,result-${token}`,
    width: 640,
    height: 360,
    byteSize: 256,
    mediaType: "image/png",
  };
}

function dependencies(
  overrides: Partial<UpscaleStoreDependencies> = {},
): UpscaleStoreDependencies {
  return {
    process: vi.fn(async (job: UpscaleJob) => result(job.input.token)),
    cancel: vi.fn(async () => true),
    exportResult: vi.fn(async () => ({ savedFileName: "output.png", importedItemIds: [], skipped: false })),
    now: () => "2026-11-02T08:00:00.000Z",
    createId: (() => {
      let sequence = 0;
      return () => `job-${++sequence}`;
    })(),
    ...overrides,
  };
}

describe("upscale queue store", () => {
  it("processes queued jobs in order with only one active job", async () => {
    const calls: string[] = [];
    let activeCount = 0;
    const deps = dependencies({
      process: vi.fn(async (job, _settings, onProgress) => {
        activeCount += 1;
        expect(activeCount).toBe(1);
        calls.push(job.input.token);
        onProgress(0.5, "处理中");
        await Promise.resolve();
        activeCount -= 1;
        return result(job.input.token);
      }),
    });
    const store = createUpscaleStore(deps);
    store.getState().enqueue([input("first"), input("second")]);

    await store.getState().startQueue();

    expect(calls).toEqual(["first", "second"]);
    expect(store.getState().jobs.map((job) => job.status)).toEqual(["result-ready", "result-ready"]);
    expect(store.getState().activeJobId).toBeNull();
    expect(store.getState().isRunning).toBe(false);
  });

  it("continues after one item fails and keeps the failure available for retry", async () => {
    const deps = dependencies({
      process: vi.fn(async (job) => {
        if (job.input.token === "bad") throw new Error("UPSCALE_WASM_FAILED: 模型执行失败");
        return result(job.input.token);
      }),
    });
    const store = createUpscaleStore(deps);
    store.getState().enqueue([input("bad"), input("good")]);

    await store.getState().startQueue();

    expect(store.getState().jobs.map((job) => job.status)).toEqual(["failed", "result-ready"]);
    expect(store.getState().jobs[0].errorCode).toBe("UPSCALE_WASM_FAILED");
    store.getState().retry("job-1");
    expect(store.getState().jobs[0].status).toBe("queued");
  });

  it("cancels the active job without starting the next queued item", async () => {
    let rejectActive: ((error: Error) => void) | null = null;
    const deps = dependencies({
      process: vi.fn(() => new Promise<UpscaleResultDescriptor>((_resolve, reject) => {
        rejectActive = reject;
      })),
      cancel: vi.fn(async () => {
        rejectActive?.(new Error("UPSCALE_CANCELED: 用户取消"));
        return true;
      }),
    });
    const store = createUpscaleStore(deps);
    store.getState().enqueue([input("first"), input("second")]);
    const running = store.getState().startQueue();
    await vi.waitFor(() => expect(store.getState().activeJobId).toBe("job-1"));

    await store.getState().cancelActive();
    await running;

    expect(deps.cancel).toHaveBeenCalledWith(expect.objectContaining({ id: "job-1" }));
    expect(store.getState().jobs.map((job) => job.status)).toEqual(["canceled", "queued"]);
  });

  it("preserves queue and settings on the same module-scoped store instance", () => {
    const store = createUpscaleStore(dependencies());
    store.getState().setPreset("photo");
    store.getState().enqueue([input("kept")]);

    const stateAfterPageSwitch = store.getState();

    expect(stateAfterPageSwitch.preset).toBe("photo");
    expect(stateAfterPageSwitch.modelId).toBe("esrgan-x4plus");
    expect(stateAfterPageSwitch.jobs[0].input.token).toBe("kept");
  });

  it("supports reorder, selection, and removal outside the active job", () => {
    const store = createUpscaleStore(dependencies());
    store.getState().enqueue([input("first"), input("second"), input("third")]);
    store.getState().reorder("job-3", "job-1");
    store.getState().select("job-2");
    store.getState().remove("job-1");

    expect(store.getState().jobs.map((job) => job.id)).toEqual(["job-3", "job-2"]);
    expect(store.getState().selectedJobId).toBe("job-2");
  });

  it("retries only failed exports while preserving successful commits", async () => {
    const attempts = new Map<string, number>();
    const deps = dependencies({
      exportResult: vi.fn(async (job) => {
        const count = (attempts.get(job.id) ?? 0) + 1;
        attempts.set(job.id, count);
        if (job.id === "job-2" && count === 1) {
          throw new Error("UPSCALE_EXPORT_FAILED: 磁盘写入失败");
        }
        return { savedFileName: `${job.id}.png`, importedItemIds: [], skipped: false };
      }),
    });
    const store = createUpscaleStore(deps);
    store.getState().enqueue([input("first"), input("second")]);
    await store.getState().startQueue();

    const firstCommit = await store.getState().commitResults();
    expect(firstCommit).toEqual({ completed: 1, failed: 1 });
    expect(store.getState().jobs.map((job) => job.status)).toEqual(["completed", "result-ready"]);

    store.getState().retry("job-2");
    expect(store.getState().jobs[1].status).toBe("result-ready");
    const retryCommit = await store.getState().commitResults(["job-2"]);

    expect(retryCommit).toEqual({ completed: 1, failed: 0 });
    expect(store.getState().jobs.map((job) => job.status)).toEqual(["completed", "completed"]);
    expect(deps.exportResult).toHaveBeenCalledTimes(3);
  });
});
