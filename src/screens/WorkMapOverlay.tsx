import { useEffect, useMemo, useRef, useState } from "react";
import type { AppApi, WorkMapImage } from "../api/types";
import type { Association } from "../domain/association";
import { deriveStorylineRoute } from "../domain/storyline";
import type { Location, LocationMark, SettingCatalog, Storyline } from "../domain/setting";
import { displaySettingName } from "../domain/settingNames";
import {
  containFittedRect,
  containerPointFromImage,
  imagePointFromContainer,
  mapImageKindFromFileName,
  type ContainerPoint,
  type MapSize,
} from "../domain/workMap";

type Props = {
  api: AppApi;
  map: WorkMapImage | null;
  catalog: SettingCatalog;
  onMapChange: (map: WorkMapImage | null) => void;
  onCatalogChange: (catalog: SettingCatalog) => void;
  onClose: () => void;
};

function objectUrlFor(map: WorkMapImage): string {
  const bytes = Uint8Array.from(map.bytes);
  return URL.createObjectURL(new Blob([bytes], { type: map.mimeType }));
}

function pointerIn(
  element: HTMLElement,
  event: { clientX: number; clientY: number },
): ContainerPoint {
  const rect = element.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

export function WorkMapOverlay({
  api,
  map,
  catalog,
  onMapChange,
  onCatalogChange,
  onClose,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const srcRef = useRef<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [imageSize, setImageSize] = useState<MapSize | null>(null);
  const [stageSize, setStageSize] = useState<MapSize>({ width: 0, height: 0 });
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [draftMarks, setDraftMarks] = useState<Record<string, LocationMark>>({});
  const draftMarksRef = useRef<Record<string, LocationMark>>({});
  const dragIdRef = useRef<string | null>(null);
  const draggedRef = useRef(false);
  const [storylineId, setStorylineId] = useState(catalog.storylines[0]?.id ?? "");
  const storyline = catalog.storylines.find((item) => item.id === storylineId) ?? catalog.storylines[0];
  const [associationLoad, setAssociationLoad] = useState<{
    storyline: Storyline;
    byEvent: Record<string, Association[]>;
    error: string | null;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const loaded = associationLoad?.storyline === storyline ? associationLoad : null;

  useEffect(() => {
    if (!storyline) {
      return;
    }
    let cancelled = false;
    setAssociationLoad(null);
    void Promise.all(
      storyline.eventIds.map(async (id) => [id, await api.listAssociations("event", id)] as const),
    )
      .then((entries) => {
        if (!cancelled) {
          setAssociationLoad({ storyline, byEvent: Object.fromEntries(entries), error: null });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setAssociationLoad({ storyline, byEvent: {}, error: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, storyline, retry]);

  useEffect(() => {
    if (srcRef.current) {
      URL.revokeObjectURL(srcRef.current);
      srcRef.current = null;
    }
    setImageSize(null);
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

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    const update = () => {
      setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [src]);

  const unmarked = catalog.locations.filter((item) => item.mark === null);
  const marked = catalog.locations.filter((item) => item.mark !== null);

  useEffect(() => {
    const ids = catalog.locations.filter((item) => item.mark === null).map((item) => item.id);
    setPlacingId((current) => (current && ids.includes(current) ? current : (ids[0] ?? null)));
  }, [catalog.locations]);

  const fitted = useMemo(
    () => (imageSize ? containFittedRect(stageSize, imageSize) : null),
    [imageSize, stageSize],
  );

  const markOf = (location: Location): LocationMark | null =>
    draftMarks[location.id] ?? location.mark;

  const route = deriveStorylineRoute(
    storyline ?? { eventIds: [] },
    catalog.events,
    catalog.locations.map((location) => ({ ...location, mark: map ? markOf(location) : null })),
    loaded?.byEvent ?? {},
  );
  const routePoints = fitted && loaded && !loaded.error
    ? route.stops.map((stop) => ({ ...stop, point: containerPointFromImage(stop.mark, fitted) }))
    : [];

  const persistMark = async (location: Location, point: LocationMark) => {
    try {
      const next = await api.saveLocation({ ...location, mark: point });
      setError(null);
      onCatalogChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="dialog work-map-dialog" onClick={(event) => event.stopPropagation()}>
        <header className="work-map-head">
          <h2>作品总图</h2>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </header>
        <div className="work-map-body">
          <div
            ref={stageRef}
            className="work-map-stage"
            onClick={(event) => {
              if (draggedRef.current) {
                draggedRef.current = false;
                return;
              }
              if (!placingId || !fitted || !stageRef.current) {
                return;
              }
              const point = imagePointFromContainer(pointerIn(stageRef.current, event), fitted);
              if (!point) {
                return;
              }
              const location = catalog.locations.find((item) => item.id === placingId);
              if (!location || location.mark) {
                return;
              }
              void persistMark(location, point);
            }}
          >
            {src ? (
              <img
                src={src}
                alt="作品总图底图"
                onLoad={(event) => {
                  setImageSize({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  });
                }}
              />
            ) : (
              <p className="muted">还没有底图。放入一张 png、jpg 或 webp。</p>
            )}
            {src && fitted && routePoints.length > 0 ? (
              <>
                <svg className="work-map-route" role="img" aria-label="事件走线">
                  {routePoints.length > 1 ? (
                    <polyline points={routePoints.map(({ point }) => `${point.x},${point.y}`).join(" ")} />
                  ) : null}
                </svg>
                {route.markers.map((marker) => {
                  const point = containerPointFromImage(marker.mark, fitted);
                  return (
                    <span
                      key={marker.visits[0].eventId}
                      className="work-map-route-number"
                      style={{
                        left: `clamp(2rem, ${point.x}px, calc(100% - 2rem))`,
                        top: `clamp(2px, ${point.y + 14}px, calc(100% - 1.75rem))`,
                      }}
                      title={marker.visits.map((visit) => `${visit.inclusionNumber}. ${displaySettingName("event", visit.eventName)}`).join("；")}
                    >
                      {marker.visits.map((visit) => visit.inclusionNumber).join("、")}
                    </span>
                  );
                })}
              </>
            ) : null}
            {src && fitted
              ? marked.map((location) => {
                  const mark = markOf(location);
                  if (!mark) {
                    return null;
                  }
                  const display = containerPointFromImage(mark, fitted);
                  return (
                    <button
                      key={location.id}
                      type="button"
                      className="work-map-mark"
                      style={{ left: display.x, top: display.y }}
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        dragIdRef.current = location.id;
                        draggedRef.current = false;
                      }}
                      onPointerMove={(event) => {
                        const dragId = dragIdRef.current;
                        if (!dragId || !fitted || !stageRef.current) {
                          return;
                        }
                        const point = imagePointFromContainer(
                          pointerIn(stageRef.current, event),
                          fitted,
                        );
                        if (!point) {
                          return;
                        }
                        draggedRef.current = true;
                        draftMarksRef.current = { ...draftMarksRef.current, [dragId]: point };
                        setDraftMarks(draftMarksRef.current);
                      }}
                      onPointerUp={(event) => {
                        event.stopPropagation();
                        const dragId = dragIdRef.current;
                        dragIdRef.current = null;
                        if (!dragId) {
                          return;
                        }
                        const point = draftMarksRef.current[dragId];
                        const nextDraft = { ...draftMarksRef.current };
                        delete nextDraft[dragId];
                        draftMarksRef.current = nextDraft;
                        setDraftMarks(nextDraft);
                        if (!point) {
                          return;
                        }
                        const current = catalog.locations.find((item) => item.id === dragId);
                        if (!current) {
                          return;
                        }
                        void persistMark(current, point);
                      }}
                    >
                      {displaySettingName("location", location.name)}
                    </button>
                  );
                })
              : null}
          </div>
          <aside className="work-map-unmarked">
              <label>
                故事线
                <select aria-label="故事线" value={storyline?.id ?? ""} onChange={(event) => setStorylineId(event.target.value)}>
                  {catalog.storylines.length === 0 ? <option value="">还没有故事线</option> : null}
                  {catalog.storylines.map((item) => (
                    <option key={item.id} value={item.id}>{displaySettingName("storyline", item.name)}</option>
                  ))}
                </select>
              </label>
              {storyline ? (
                <section className="work-map-unlocated">
                  <h3>未定点事件</h3>
                  {!loaded ? <p role="status">正在读取事件关联…</p> : loaded.error ? (
                    <p role="alert">事件关联读取失败：{loaded.error} <button type="button" onClick={() => setRetry((value) => value + 1)}>重试</button></p>
                  ) : route.unlocated.length > 0 ? (
                    <ol aria-label="未定点事件">
                      {route.unlocated.map((item) => (
                        <li key={item.eventId}>{item.inclusionNumber}. {displaySettingName("event", item.eventName)}</li>
                      ))}
                    </ol>
                  ) : <p className="muted">没有未定点事件。</p>}
                </section>
              ) : null}
              {map ? <>
              <h3>未定点地点</h3>
              {catalog.locations.length === 0 ? (
                <p className="muted">还没有地点。</p>
              ) : unmarked.length === 0 ? (
                <p className="muted">地点都已打上标记。</p>
              ) : (
                <ul>
                  {unmarked.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={item.id === placingId ? "work-map-pick is-selected" : "work-map-pick"}
                        onClick={() => setPlacingId(item.id)}
                      >
                        {displaySettingName("location", item.name)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {placingId ? <p className="muted">在图上单击为选中地点打上标记。</p> : null}
              </> : null}
          </aside>
        </div>
        <section className="work-map-chain">
          <h3>事件链</h3>
          {!storyline ? <p className="muted">还没有故事线。</p> : route.chain.length === 0 ? (
            <p className="muted">这条故事线还没有收录事件。</p>
          ) : (
            <ol aria-label="事件链">
              {route.chain.map((item) => (
                <li key={item.eventId}>
                  <span>{item.inclusionNumber}. {displaySettingName("event", item.eventName)}</span>
                  <small>{!loaded ? "正在读取关联…" : loaded.error ? "关联读取失败" : item.mark ? displaySettingName("location", item.locationName ?? "") : "未定点"}</small>
                </li>
              ))}
            </ol>
          )}
        </section>
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
                void api.clearWorkMap().then(async () => {
                  setError(null);
                  onMapChange(null);
                  onCatalogChange(await api.loadCatalog());
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
