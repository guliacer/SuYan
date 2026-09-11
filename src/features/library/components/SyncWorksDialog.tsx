import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAccountStore } from "../../account/store/useAccountStore";
import { useLibraryStore } from "../store/useLibraryStore";
import { useLocale } from "@/components/LocaleProvider";

export function SyncWorksDialog({ itemIds, onClose }: { itemIds: string[]; onClose: () => void }) {
  const { t } = useLocale();
  const user = useAccountStore(state => state.user);
  const [expectedUid] = useState(user?.uid ?? "");
  const [force, setForce] = useState(false);
  const busy = useLibraryStore(state => state.isBusy);
  const sync = useLibraryStore(state => state.syncWorksToAccount);
  return <ConfirmDialog open title={t("同步为当前账户的作品？")} tone="primary"
    confirmLabel={t("同步作品")} busyLabel={t("正在同步作品…")} isBusy={busy} confirmDisabled={!user || user.uid !== expectedUid}
    description={<div className="grid gap-3">
      <p>{t("将所选 {count} 张素材关联到「{username}」，保存昵称和头像。不上传图像；登录前的素材不会自动关联。", { count: itemIds.length, username: user?.username ?? t("未登录") })}</p>
      <p>{t("默认跳过所有已有作者信息的素材，保留其他用户的作品归属。")}</p>
      <label className="flex items-start gap-2"><input type="checkbox" checked={force} disabled={busy} onChange={e => setForce(e.target.checked)} />{t("强制替换已有作者信息（下一步再次确认）")}</label>
      {!user ? <p role="alert" className="text-danger">{t("请先登录账户，再同步作品。")}</p> : user.uid !== expectedUid ? <p role="alert" className="text-danger">{t("账户已变化，请关闭后重新选择。")}</p> : null}
    </div>}
    onCancel={onClose} onConfirm={() => { void sync(itemIds, expectedUid, force).then(done => { if (done) onClose(); }); }} />;
}
