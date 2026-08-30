import { useEffect, useRef, useState } from "react";
import type { AppApi, WorkMapImage } from "../api/types";
import { mapImageKindFromFileName } from "../domain/workMap";

type Props = {
  api: AppApi;
  map: WorkMapImage | null;
  onMapChange: (map: WorkMapImage | null) => void;
  onClose: () => void;
};

function objectUrlFor(map: WorkMapImage): string {
  const bytes = Uint8Array.from(map.bytes);
  return URL.createObjectURL(new Blob([bytes], { type: map.mimeType }));
}

export function WorkMapOverlay({ api, map, onMapChange, onClose }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const srcRef = useRef<string | null>(null);

  useEffect(() => {
    if (srcRef.current) {
      URL.revokeObjectURL(srcRef.current);
      srcRef.current = null;
    }
    if (!map) {
      setSrc(null);
      return;
    }
    const next = objectUrlFor(map);
    srcRef.current = next;
    setSrc(next);
    return () => {
      if (srcRef.current) {
        URL.revokeObjectURL(srcRef.current);
        srcRef.current = null;
      }
    };
  }, [map]);

  return (
    <div className="modal" onClick={onClose}>
      <div className="dialog work-map-dialog" onClick={(event) => event.stopPropagation()}>
        <header className="work-map-head">
          <h2>作品总图</h2>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </header>
        <div className="work-map-stage">
          {src ? (
            <img src={src} alt="作品总图底图" />
          ) : (
            <p className="muted">还没有底图。放入一张 png、jpg 或 webp。</p>
          )}
        </div>
        <div className="row">
          <label className="file-button">
            {map ? "替换底图" : "放入底图"}
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) {
                  return;
                }
                try {
                  mapImageKindFromFileName(file.name);
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                  return;
                }
                void file.arrayBuffer().then(async (buffer) => {
                  try {
                    const next = await api.putWorkMap({
                      fileName: file.name,
                      bytes: Array.from(new Uint8Array(buffer)),
                    });
                    setError(null);
                    onMapChange(next);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : String(err));
                  }
                });
              }}
            />
          </label>
          {map ? (
            <button
              type="button"
              onClick={() => {
                void api.clearWorkMap().then(() => {
                  setError(null);
                  onMapChange(null);
                });
              }}
            >
              清除总图
            </button>
          ) : null}
        </div>
        {error ? <p className="error">{error}</p> : null}
      </div>
    </div>
  );
}
