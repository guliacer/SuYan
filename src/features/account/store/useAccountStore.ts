import { create } from "zustand";
import type {
  AccountExternalProviderId,
  AccountLoginProviderId,
  AccountLoginMethod,
  AccountOAuthProfileSelection,
  AccountOAuthConfirmation,
  AccountOAuthPurpose,
  AccountOAuthStartOptions,
  AccountDeviceAuthorization,
  AccountRegistrationResult,
  AccountProviderId,
  AccountProfileUpdateInput,
  AccountStatus,
  AccountUser,
  EmailLoginInput,
  EmailRegisterInput,
} from "../types/account";
import { ACCOUNT_ERROR_CODES } from "../types/account";

/**
 * 渲染层账号状态（方案 §十二）：React 只关心「是否登录 / 是谁 / 头像」，
 * 不接触 token / OAuth code / PKCE / HTTP——那些全部留在主进程 AccountService。
 * 状态变化由主进程 account:status-changed 事件推送，本地操作后也主动拉取。
 */

export type AccountActionError = { code: string; message: string } | null;

export type AccountSubmittingAction =
  | "loginEmail" | "registerEmail" | "loginOAuth" | "linkOAuth" | "confirmOAuth"
  | "selectOAuthAvatar" | "cancelOAuth" | "refreshAccount" | "updateProfile"
  | "chooseAvatar" | "removeAvatar" | "unlinkIdentity" | "logout";

type AccountState = {
  status: AccountStatus;
  user: AccountUser | null;
  provider: AccountProviderId | null;
  loginProvider: AccountLoginProviderId | null;
  lastLoginMethod: AccountLoginMethod | null;
  activeOAuthProvider: AccountLoginProviderId | null;
  oauthPurpose: AccountOAuthPurpose | null;
  /** 授权页已交给系统默认浏览器，等待 suyan:// 回调完成。 */
  oauthPendingProvider: AccountLoginProviderId | null;
  /** 当前浏览器授权事务的失效时间（毫秒时间戳）。 */
  oauthExpiresAt: number | null;
  oauthDevice: AccountDeviceAuthorization | null;
  /** OAuth 回调返回的身份，用户确认前不会成为当前登录用户。 */
  oauthConfirmation: AccountOAuthConfirmation | null;
  /** 最近一次登录/注册/OAuth 操作的结构化错误（按 code 判断，不按 message）。 */
  error: AccountActionError;
  isSubmitting: boolean;
  /** Shared busy state disables controls; only this action owns its progress text. */
  submittingAction: AccountSubmittingAction | null;
  /** 账号登录/注册对话框是否打开（供 LibraryView 隐藏 WebContentsView 浮层）。 */
  dialogOpen: boolean;

  initialize: () => Promise<void>;
  loginEmail: (input: EmailLoginInput) => Promise<void>;
  registerEmail: (
    input: EmailRegisterInput,
  ) => Promise<AccountRegistrationResult | null>;
  loginOAuth: (
    provider: AccountLoginProviderId,
    options?: AccountOAuthStartOptions,
  ) => Promise<void>;
  linkOAuth: (
    provider: AccountExternalProviderId,
    options?: AccountOAuthStartOptions,
  ) => Promise<void>;
  confirmOAuth: (selection?: AccountOAuthProfileSelection) => Promise<void>;
  selectOAuthAvatar: () => Promise<string | null>;
  cancelOAuth: () => Promise<void>;
  refreshAccount: () => Promise<void>;
  updateProfile: (input: AccountProfileUpdateInput) => Promise<void>;
  chooseAvatar: () => Promise<void>;
  removeAvatar: () => Promise<void>;
  unlinkIdentity: (provider: AccountExternalProviderId) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  setDialogOpen: (open: boolean) => void;
};

function extractError(error: unknown): { code: string; message: string } {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const code =
      typeof record.code === "string" ? record.code : "ACCOUNT_UNKNOWN";
    const message =
      typeof record.message === "string"
        ? record.message
        : "账号操作失败，请稍后重试。";
    return { code, message };
  }
  return { code: "ACCOUNT_UNKNOWN", message: "账号操作失败，请稍后重试。" };
}

export const useAccountStore = create<AccountState>((set, get) => {
  let oauthExpiryTimer: ReturnType<typeof setTimeout> | null = null;
  let accountStatusUnsubscribe: (() => void) | null = null;

  function clearOAuthExpiryTimer(): void {
    if (oauthExpiryTimer !== null) {
      clearTimeout(oauthExpiryTimer);
      oauthExpiryTimer = null;
    }
  }

  function scheduleOAuthExpiry(
    provider: AccountLoginProviderId,
    expiresAt: number,
    purpose: AccountOAuthPurpose,
  ): void {
    clearOAuthExpiryTimer();
    const delay = Math.max(0, expiresAt - Date.now());
    oauthExpiryTimer = setTimeout(() => {
      oauthExpiryTimer = null;
      const current = get();
      if (
        current.oauthPendingProvider !== provider ||
        current.oauthExpiresAt !== expiresAt ||
        current.oauthPurpose !== purpose ||
        current.isSubmitting
      ) {
        return;
      }

      set({ isSubmitting: true, submittingAction: "cancelOAuth" });
      void window.suyanApi.accountCancelOAuth()
        .then((result) => {
          if (get().oauthPendingProvider !== provider) {
            return;
          }
          if (!result.ok) {
            set({
              isSubmitting: false, submittingAction: null,
              error: result.error,
            });
            return;
          }
          set({
            isSubmitting: false, submittingAction: null,
            activeOAuthProvider: null,
            oauthPendingProvider: null,
            oauthExpiresAt: null,
            oauthDevice: null,
            oauthPurpose: null,
            error: {
              code: ACCOUNT_ERROR_CODES.OAUTH_EXPIRED,
              message: purpose === "link" ? "等待关联已超时，请刷新账户资料查看结果。" : "授权已过期，请重新选择登录方式。",
            },
          });
        })
        .catch((error) => {
          if (get().oauthPendingProvider !== provider) {
            return;
          }
          set({
            isSubmitting: false, submittingAction: null,
            error: extractError(error),
          });
        });
    }, delay);

    // Vitest/Node timers should not keep the test worker alive; browsers ignore this branch.
    (oauthExpiryTimer as unknown as { unref?: () => void } | null)?.unref?.();
  }

  function ensureAccountStatusListener(): void {
    if (accountStatusUnsubscribe) {
      return;
    }

    accountStatusUnsubscribe = window.suyanApi.onAccountStatusChanged((status) => {
      clearOAuthExpiryTimer();
      set({
        status: status.status,
        user: status.user,
        provider: status.provider,
        loginProvider: status.loginProvider ?? null,
        lastLoginMethod: status.lastLoginMethod ?? null,
        oauthConfirmation: status.pendingOAuthConfirmation ?? null,
        oauthPurpose: status.pendingOAuthConfirmation?.purpose ?? null,
        error: status.error ?? null,
        isSubmitting: false, submittingAction: null,
        activeOAuthProvider: null,
        oauthPendingProvider: null,
        oauthExpiresAt: null,
        oauthDevice: null,
      });
    });
  }

  return {
    status: "initializing",
    user: null,
    provider: null,
    loginProvider: null,
    lastLoginMethod: null,
    activeOAuthProvider: null,
    oauthPurpose: null,
    oauthPendingProvider: null,
    oauthExpiresAt: null,
    oauthDevice: null,
    oauthConfirmation: null,
    error: null,
    isSubmitting: false, submittingAction: null,
    dialogOpen: false,

    initialize: async () => {
      ensureAccountStatusListener();
      set({ status: "initializing" });
      try {
        const result = await window.suyanApi.accountGetStatus();
        if (result.ok) {
          clearOAuthExpiryTimer();
          set({
            status: result.data.status,
            user: result.data.user,
            provider: result.data.provider,
            loginProvider: result.data.loginProvider ?? null,
            lastLoginMethod: result.data.lastLoginMethod ?? null,
            oauthConfirmation: result.data.pendingOAuthConfirmation ?? null,
            oauthPurpose: result.data.pendingOAuthConfirmation?.purpose ?? null,
            error: null,
            oauthPendingProvider: null,
            oauthExpiresAt: null,
            oauthDevice: null,
          });
        } else {
          clearOAuthExpiryTimer();
          set({
            status: "unauthenticated",
            user: null,
            provider: null,
            loginProvider: null,
            oauthConfirmation: null,
            error: null,
            oauthPendingProvider: null,
            oauthExpiresAt: null,
            oauthDevice: null,
            oauthPurpose: null,
          });
        }
      } catch {
        clearOAuthExpiryTimer();
        set({
          status: "unauthenticated",
          user: null,
          provider: null,
          loginProvider: null,
          oauthConfirmation: null,
          error: null,
          oauthPendingProvider: null,
          oauthExpiresAt: null,
          oauthDevice: null,
          oauthPurpose: null,
        });
      }
    },

  loginEmail: async (input) => {
    if (get().isSubmitting) return;
    clearOAuthExpiryTimer();
    set({
      isSubmitting: true, submittingAction: "loginEmail",
      error: null,
      oauthPendingProvider: null,
      oauthExpiresAt: null,
      oauthDevice: null,
      oauthPurpose: null,
      oauthConfirmation: null,
    });
    try {
      const result = await window.suyanApi.accountLoginEmail(input);
      if (!result.ok) {
        set({ error: result.error });
        return;
      }
      set({
        status: result.data.status,
        user: result.data.user,
        provider: result.data.provider,
        loginProvider: result.data.loginProvider ?? null,
        lastLoginMethod: result.data.lastLoginMethod ?? null,
        oauthPendingProvider: null,
        oauthExpiresAt: null,
        oauthDevice: null,
        oauthPurpose: null,
        oauthConfirmation: null,
      });
    } catch (error) {
      set({ error: extractError(error) });
    } finally {
      set({ isSubmitting: false, submittingAction: null });
    }
  },

  registerEmail: async (input) => {
    if (get().isSubmitting) return null;
    clearOAuthExpiryTimer();
    set({
      isSubmitting: true, submittingAction: "registerEmail",
      error: null,
      oauthPendingProvider: null,
      oauthExpiresAt: null,
      oauthDevice: null,
      oauthPurpose: null,
      oauthConfirmation: null,
    });
    try {
      const result = await window.suyanApi.accountRegisterEmail(input);
      if (!result.ok) {
        set({ error: result.error });
        return null;
      }
      if ("verificationRequired" in result.data) {
        return result.data;
      }
      set({
        status: result.data.status,
        user: result.data.user,
        provider: result.data.provider,
        loginProvider: result.data.loginProvider ?? null,
        lastLoginMethod: result.data.lastLoginMethod ?? null,
        oauthPendingProvider: null,
        oauthExpiresAt: null,
        oauthDevice: null,
        oauthPurpose: null,
        oauthConfirmation: null,
      });
      return null;
    } catch (error) {
      set({ error: extractError(error) });
      return null;
    } finally {
      set({ isSubmitting: false, submittingAction: null });
    }
  },

  loginOAuth: async (provider, options) => {
    const current = get();
    if (current.oauthPendingProvider) {
      set({
        error: {
          code: ACCOUNT_ERROR_CODES.OAUTH_IN_PROGRESS,
          message: "已有一个账号操作正在授权，请完成或取消当前操作。",
        },
      });
      return;
    }
    if (current.oauthConfirmation) {
      set({
        error: {
          code: ACCOUNT_ERROR_CODES.OAUTH_IN_PROGRESS,
          message: "已有一个账号操作待确认，请先确认或取消当前操作。",
        },
      });
      return;
    }
    if (current.isSubmitting) {
      return;
    }
    clearOAuthExpiryTimer();
    set({
      isSubmitting: true, submittingAction: "loginOAuth",
      error: null,
      activeOAuthProvider: provider,
      oauthPurpose: "login",
      oauthPendingProvider: null,
      oauthExpiresAt: null,
      oauthDevice: null,
      oauthConfirmation: null,
    });
    try {
      const result = options
        ? await window.suyanApi.accountStartOAuth(provider, options)
        : await window.suyanApi.accountStartOAuth(provider);
      if (!result.ok) {
        set({
          error: result.error,
          oauthPurpose: null,
          oauthPendingProvider: null,
          oauthExpiresAt: null,
          oauthDevice: null,
        });
      } else {
        const expiresAt = result.data.expiresAt;
        if (!Number.isFinite(expiresAt)) {
          set({
            error: {
              code: ACCOUNT_ERROR_CODES.OAUTH_STATE_INVALID,
              message: "登录事务无效，请重新选择登录方式。",
            },
            oauthPendingProvider: null,
            oauthExpiresAt: null,
            oauthDevice: null,
            oauthPurpose: null,
          });
        } else {
          const currentState = get();
          if (currentState.oauthConfirmation || currentState.error || currentState.oauthPurpose !== "login") {
            return;
          }
          set({ oauthPendingProvider: provider, oauthExpiresAt: expiresAt, oauthDevice: result.data.device ?? null });
          scheduleOAuthExpiry(provider, expiresAt, "login");
        }
      }
      // 浏览器回调由主进程协议处理；成功或失败都会经 onAccountStatusChanged 回到这里。
    } catch (error) {
      set({ error: extractError(error) });
    } finally {
      set({ isSubmitting: false, submittingAction: null, activeOAuthProvider: null });
    }
  },

  linkOAuth: async (provider, options) => {
    const current = get();
    if (current.status !== "authenticated" || !current.user) {
      set({
        error: {
          code: ACCOUNT_ERROR_CODES.NOT_LOGGED_IN,
          message: "请先登录当前账号，再绑定其他登录方式。",
        },
      });
      return;
    }
    if (current.oauthPendingProvider || current.oauthConfirmation) {
      set({
        error: {
          code: ACCOUNT_ERROR_CODES.OAUTH_IN_PROGRESS,
          message: "已有一个账号操作正在进行，请完成或取消当前操作。",
        },
      });
      return;
    }
    if (current.isSubmitting) {
      return;
    }

    clearOAuthExpiryTimer();
    set({
      isSubmitting: true, submittingAction: "linkOAuth",
      error: null,
      activeOAuthProvider: provider,
      oauthPurpose: "link",
      oauthPendingProvider: null,
      oauthExpiresAt: null,
      oauthDevice: null,
      oauthConfirmation: null,
    });
    try {
      const result = options
        ? await window.suyanApi.accountStartOAuthLink(provider, options)
        : await window.suyanApi.accountStartOAuthLink(provider);
      if (!result.ok) {
        set({
          error: result.error,
          activeOAuthProvider: null,
          oauthPurpose: null,
          oauthPendingProvider: null,
          oauthExpiresAt: null,
          oauthDevice: null,
        });
        return;
      }

      const expiresAt = result.data.expiresAt;
      if (!Number.isFinite(expiresAt)) {
        set({
          error: {
            code: ACCOUNT_ERROR_CODES.OAUTH_STATE_INVALID,
            message: "绑定事务无效，请重新选择登录方式。",
          },
          activeOAuthProvider: null,
          oauthPurpose: null,
          oauthPendingProvider: null,
          oauthExpiresAt: null,
          oauthDevice: null,
        });
        return;
      }

      set({ oauthPendingProvider: provider, oauthExpiresAt: expiresAt });
      scheduleOAuthExpiry(provider, expiresAt, "link");
    } catch (error) {
      set({
        error: extractError(error),
        activeOAuthProvider: null,
        oauthPurpose: null,
        oauthPendingProvider: null,
        oauthExpiresAt: null,
        oauthDevice: null,
      });
    } finally {
      set({ isSubmitting: false, submittingAction: null, activeOAuthProvider: null });
    }
  },

  confirmOAuth: async (selection) => {
    const current = get();
    if (!current.oauthConfirmation || current.isSubmitting) {
      return;
    }
    set({ isSubmitting: true, submittingAction: "confirmOAuth", error: null });
    try {
      const result = await window.suyanApi.accountConfirmOAuth(selection);
      if (!result.ok) {
        set({ error: result.error });
        return;
      }
      set({
        status: result.data.status,
        user: result.data.user,
        provider: result.data.provider,
        loginProvider: result.data.loginProvider ?? null,
        lastLoginMethod: result.data.lastLoginMethod ?? null,
        activeOAuthProvider: null,
        oauthPendingProvider: null,
        oauthExpiresAt: null,
        oauthDevice: null,
        oauthPurpose: null,
        oauthConfirmation: null,
      });
    } catch (error) {
      set({ error: extractError(error) });
    } finally {
      set({ isSubmitting: false, submittingAction: null });
    }
  },

  selectOAuthAvatar: async () => {
    const current = get();
    if (!current.oauthConfirmation || current.isSubmitting) {
      return null;
    }
    set({ isSubmitting: true, submittingAction: "selectOAuthAvatar", error: null });
    try {
      const result = await window.suyanApi.accountSelectOAuthAvatar();
      if (!result.ok) {
        set({ error: result.error });
        return null;
      }
      return result.data.selected ? result.data.previewUrl ?? null : null;
    } catch (error) {
      set({ error: extractError(error) });
      return null;
    } finally {
      set({ isSubmitting: false, submittingAction: null });
    }
  },

  cancelOAuth: async () => {
    const current = get();
    if ((!current.oauthPendingProvider && !current.oauthConfirmation) || current.isSubmitting) {
      return;
    }
    set({ isSubmitting: true, submittingAction: "cancelOAuth", error: null });
    try {
      const result = await window.suyanApi.accountCancelOAuth();
      if (!result.ok) {
        set({ error: result.error });
        return;
      }
      clearOAuthExpiryTimer();
      set({
        oauthPendingProvider: null,
        oauthExpiresAt: null,
        oauthDevice: null,
        activeOAuthProvider: null,
        oauthPurpose: null,
        oauthConfirmation: null,
        error: result.data.cancelled
          ? null
          : {
              code: ACCOUNT_ERROR_CODES.OAUTH_EXPIRED,
              message: "授权已过期，请重新选择登录方式。",
            },
      });
    } catch (error) {
      set({ error: extractError(error) });
    } finally {
      set({ isSubmitting: false, submittingAction: null });
    }
  },

  refreshAccount: async () => {
    const current = get();
    if (!current.user || current.status !== "authenticated" || current.isSubmitting) {
      return;
    }
    set({ isSubmitting: true, submittingAction: "refreshAccount", error: null });
    try {
      const result = await window.suyanApi.accountRefresh();
      if (!result.ok) {
        set({ error: result.error });
        return;
      }
      set({
        status: result.data.status,
        user: result.data.user,
        provider: result.data.provider,
        loginProvider: result.data.loginProvider ?? null,
        lastLoginMethod: result.data.lastLoginMethod ?? null,
        oauthConfirmation: result.data.pendingOAuthConfirmation ?? null,
        oauthPurpose: result.data.pendingOAuthConfirmation?.purpose ?? null,
        error: result.data.error ?? null,
      });
    } catch (error) {
      set({ error: extractError(error) });
    } finally {
      set({ isSubmitting: false, submittingAction: null });
    }
  },

  updateProfile: async (input) => {
    const current = get();
    if (!current.user || current.status !== "authenticated" || current.isSubmitting) {
      return;
    }
    set({ isSubmitting: true, submittingAction: "updateProfile", error: null });
    try {
      const result = await window.suyanApi.accountUpdateProfile(input);
      if (!result.ok) {
        set({ error: result.error });
        return;
      }
      set({
        status: result.data.status,
        user: result.data.user,
        provider: result.data.provider,
        loginProvider: result.data.loginProvider ?? null,
        lastLoginMethod: result.data.lastLoginMethod ?? null,
        oauthConfirmation: result.data.pendingOAuthConfirmation ?? null,
        oauthPurpose: result.data.pendingOAuthConfirmation?.purpose ?? null,
        error: result.data.error ?? null,
      });
    } catch (error) {
      set({ error: extractError(error) });
    } finally {
      set({ isSubmitting: false, submittingAction: null });
    }
  },

  chooseAvatar: async () => {
    const current = get();
    if (!current.user || current.status !== "authenticated" || current.isSubmitting) {
      return;
    }
    set({ isSubmitting: true, submittingAction: "chooseAvatar", error: null });
    try {
      const result = await window.suyanApi.accountChooseAvatar();
      if (!result.ok) {
        set({ error: result.error });
        return;
      }
      if (result.data) {
        set({
          status: result.data.status,
          user: result.data.user,
          provider: result.data.provider,
          loginProvider: result.data.loginProvider ?? null,
          lastLoginMethod: result.data.lastLoginMethod ?? null,
          oauthConfirmation: result.data.pendingOAuthConfirmation ?? null,
          oauthPurpose: result.data.pendingOAuthConfirmation?.purpose ?? null,
          error: result.data.error ?? null,
        });
      }
    } catch (error) {
      set({ error: extractError(error) });
    } finally {
      set({ isSubmitting: false, submittingAction: null });
    }
  },

  removeAvatar: async () => {
    const current = get();
    if (!current.user || current.status !== "authenticated" || current.isSubmitting) {
      return;
    }
    set({ isSubmitting: true, submittingAction: "removeAvatar", error: null });
    try {
      const result = await window.suyanApi.accountRemoveAvatar();
      if (!result.ok) {
        set({ error: result.error });
        return;
      }
      set({
        status: result.data.status,
        user: result.data.user,
        provider: result.data.provider,
        loginProvider: result.data.loginProvider ?? null,
        lastLoginMethod: result.data.lastLoginMethod ?? null,
        oauthConfirmation: result.data.pendingOAuthConfirmation ?? null,
        oauthPurpose: result.data.pendingOAuthConfirmation?.purpose ?? null,
        error: result.data.error ?? null,
      });
    } catch (error) {
      set({ error: extractError(error) });
    } finally {
      set({ isSubmitting: false, submittingAction: null });
    }
  },

  unlinkIdentity: async (provider) => {
    const current = get();
    if (!current.user || current.status !== "authenticated" || current.isSubmitting) {
      return;
    }
    set({ isSubmitting: true, submittingAction: "unlinkIdentity", error: null });
    try {
      const result = await window.suyanApi.accountUnlinkIdentity(provider);
      if (!result.ok) {
        set({ error: result.error });
        return;
      }
      set({
        status: result.data.status,
        user: result.data.user,
        provider: result.data.provider,
        loginProvider: result.data.loginProvider ?? null,
        lastLoginMethod: result.data.lastLoginMethod ?? null,
        oauthConfirmation: result.data.pendingOAuthConfirmation ?? null,
        oauthPurpose: result.data.pendingOAuthConfirmation?.purpose ?? null,
        error: result.data.error ?? null,
      });
    } catch (error) {
      set({ error: extractError(error) });
    } finally {
      set({ isSubmitting: false, submittingAction: null });
    }
  },

  logout: async () => {
    if (get().isSubmitting) return;
    clearOAuthExpiryTimer();
    set({
      isSubmitting: true, submittingAction: "logout",
      error: null,
      oauthPendingProvider: null,
      oauthExpiresAt: null,
      oauthDevice: null,
      oauthPurpose: null,
      oauthConfirmation: null,
    });
    try {
      const result = await window.suyanApi.accountLogout();
      if (!result.ok) {
        set({ error: result.error });
        return;
      }
      set({
        status: result.data.status,
        user: result.data.user,
        provider: result.data.provider,
        loginProvider: result.data.loginProvider ?? null,
        lastLoginMethod: result.data.lastLoginMethod ?? null,
        oauthPendingProvider: null,
        oauthExpiresAt: null,
        oauthDevice: null,
        oauthPurpose: null,
        oauthConfirmation: null,
      });
    } catch (error) {
      set({ error: extractError(error) });
    } finally {
      set({ isSubmitting: false, submittingAction: null });
    }
  },

  clearError: () => set({ error: null }),

    setDialogOpen: (open) => set({ dialogOpen: open }),
  };
});

/** 供组件直接订阅的便捷选择器。 */
export function useAccountStatus(): AccountStatus {
  return useAccountStore((state) => state.status);
}

export function useAccountUser(): AccountUser | null {
  return useAccountStore((state) => state.user);
}
