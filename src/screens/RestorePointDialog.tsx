import { useEffect, useId, useRef, useState } from "react";
import type { AppApi, RestorePoint, WorkSummary } from "../api/types";
import "./RestorePointDialog.css";

type Props = {
  api: AppApi;
  work: WorkSummary;
  onClose: () => void;
  onRestored: (work: WorkSummary) => void | Promise<void>;
  pendingDraft?: Parameters<AppApi["saveChapter"]>[0];
};

export function RestorePointDialog({ api, work, onClose, onRestored, pendingDraft }: Props) {
  const [points, setPoints] = useState<RestorePoint[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void api.listRestorePoints(work.id).then(items => {
      if (cancelled) return;
      const newestFirst = [...items].reverse();
      setPoints(newestFirst);
      setSelected(newestFirst[0]?.folderName ?? "");
    }).catch(err => {
      if (!cancelled) setError(String(err));
    }).finally(() => { if (!cancelled) setLoading(false); });
    panel.current?.focus();
    return () => { cancelled = true; };
  }, [api, work.id]);

  const restore = async (replaceConfirmed: boolean) => {
    if (busy || done || !selected) return;
    setBusy(true);
    setError(null);
    try {
      const restored = await api.restoreFromPoint(work.id, selected, replaceConfirmed, pendingDraft);
      await onRestored(restored);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="restore-point-backdrop">
      <div ref={panel} className="restore-point-dialog" role="dialog" aria-modal="true"
        aria-labelledby={headingId} tabIndex={-1}
        onKeyDown={event => {
          if (event.key === "Escape" && !busy) {
            event.preventDefault();
            if (confirming) setConfirming(false); else onClose();
          }
          if (event.key === "Tab") {
            const controls = [...panel.current!.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled)")];
            const index = controls.indexOf(document.activeElement as HTMLElement);
            if (controls.length && (index < 0 || (event.shiftKey ? index === 0 : index === controls.length - 1))) {
              event.preventDefault();
              controls[event.shiftKey ? controls.length - 1 : 0].focus();
            }
          }
        }}>
        <h2 id={headingId}>从恢复点恢复 · {work.name}</h2>
        {work.problem ? <p role="alert">{work.problem}。可从最近可用恢复点恢复为新作品；损坏包和原恢复点会保留。</p> : null}
        {pendingDraft ? <p>未保存的当前章节将写入新作品；若恢复点中没有该章，则追加为新章。取消或失败不会丢弃当前草稿。</p> : null}
        {error ? <p role="alert" className="restore-point-error">{error}</p> : null}
        {loading ? <p role="status">正在检查可用恢复点…</p> : points.length === 0 ? <p>没有可用恢复点。原作品数据包未改动。</p> : confirming ? (
          <>
            <p>再次确认：将用「{selected}」替换「{work.name}」的正文、结构、设定、关联和地图。</p>
            <p>先为当前作品创建一个手动恢复点，再执行替换。当前作品身份与文件夹不变。</p>
            <div className="restore-point-actions">
              <button type="button" disabled={busy || done} onClick={() => void restore(true)}>确认替换当前作品</button>
              <button type="button" disabled={busy} onClick={() => setConfirming(false)}>取消替换</button>
            </div>
          </>
        ) : (
          <>
            <label>可用恢复点（最新在前）
              <select value={selected} disabled={busy || done} onChange={event => setSelected(event.target.value)}>
                {points.map(point => <option key={point.folderName} value={point.folderName}>{point.folderName}</option>)}
              </select>
            </label>
            <p>默认展开为作品库中的新作品，保留原作品和恢复点。</p>
            <p className="restore-point-hint">自动恢复点保留最近 10 个及最近 7 日代表；手动恢复点不自动删除。</p>
            <div className="restore-point-actions">
              <button type="button" className="primary" disabled={busy || done} onClick={() => void restore(false)}>恢复为新作品</button>
              {!work.problem ? <button type="button" disabled={busy || done} onClick={() => setConfirming(true)}>替换当前作品…</button> : null}
            </div>
          </>
        )}
        {busy ? <p role="status">正在恢复，请勿关闭应用…</p> : null}
        {done ? <p role="status">恢复完成，作品已在作品库中。</p> : null}
        <button type="button" disabled={busy} onClick={onClose}>关闭</button>
      </div>
    </div>
  );
}
