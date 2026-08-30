import { useEffect, useState } from "react";
import type { AppApi } from "../api/types";
import {
  LINKABLE_LABEL,
  otherEnd,
  type Association,
  type LinkRef,
  type LinkableKind,
} from "../domain/association";
import { displayChapterTitle, type Outline } from "../domain/outline";
import { displaySettingName, type SettingKind } from "../domain/settingNames";
import type { SettingCatalog } from "../domain/setting";
import { matchesCharacterQuery, matchesNameQuery } from "../domain/settingFilter";

type Props = {
  api: AppApi;
  from: LinkRef;
  catalog: SettingCatalog;
  outline: Outline;
  onOpen: (ref: LinkRef) => void;
  showHeading?: boolean;
};

const CREATE_KINDS: LinkableKind[] = ["character", "location", "event", "setting"];

export function AssociationSection({ api, from, catalog, outline, onOpen, showHeading = true }: Props) {
  const [items, setItems] = useState<Association[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setItems(await api.listAssociations(from.kind, from.id));
  };

  useEffect(() => {
    void reload();
  }, [from.kind, from.id]);

  const labelOf = (ref: LinkRef) => {
    if (ref.kind === "chapter") {
      const chapter = outline.chapters.find((item) => item.id === ref.id);
      return displayChapterTitle(chapter?.title ?? "");
    }
    return displaySettingName(ref.kind as SettingKind, nameOf(catalog, ref));
  };

  const candidates = searchCandidates(catalog, outline, query, from, items);

  return (
    <div className="association-box">
      {showHeading ? <strong>关联</strong> : null}
      {error ? <p className="error">{error}</p> : null}
      {items.length === 0 ? <p className="muted">还没有关联。只从这里或设定条目明确建立。</p> : null}
      {items.map((item) => {
        const other = otherEnd(item, from);
        return (
          <div key={item.id} className="association-row">
            <button type="button" className="tree-open" onClick={() => onOpen(other)}>
              {LINKABLE_LABEL[other.kind]} · {labelOf(other)}
            </button>
            <input
              value={item.note}
              placeholder="可选说明"
              onChange={(event) => {
                const note = event.target.value;
                setItems((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, note } : entry)));
              }}
              onBlur={() => void api.updateAssociationNote(item.id, item.note)}
            />
            <button type="button" onClick={() => void api.deleteAssociation(item.id).then(reload)}>
              移除
            </button>
          </div>
        );
      })}
      <input
        value={query}
        placeholder="搜索已有项并关联"
        onChange={(event) => setQuery(event.target.value)}
      />
      {query.trim() ? (
        <ul className="setting-list">
          {candidates.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <button
                type="button"
                className="tree-open"
                onClick={() => {
                  void api
                    .createAssociation({ left: from, right: item, note: "" })
                    .then(() => {
                      setQuery("");
                      setError(null);
                      return reload();
                    })
                    .catch((err) => setError(err instanceof Error ? err.message : String(err)));
                }}
              >
                关联 {LINKABLE_LABEL[item.kind]} · {labelOf(item)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="row wrap">
        {CREATE_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => {
              void (async () => {
                try {
                  const created = await createKind(api, kind);
                  await api.createAssociation({
                    left: from,
                    right: { kind, id: created.id },
                    note: "",
                  });
                  setError(null);
                  await reload();
                  onOpen({ kind, id: created.id });
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                }
              })();
            }}
          >
            新建并关联{LINKABLE_LABEL[kind]}
          </button>
        ))}
      </div>
    </div>
  );
}

function nameOf(catalog: SettingCatalog, ref: LinkRef): string {
  switch (ref.kind) {
    case "character":
      return catalog.characters.find((item) => item.id === ref.id)?.name ?? "";
    case "location":
      return catalog.locations.find((item) => item.id === ref.id)?.name ?? "";
    case "event":
      return catalog.events.find((item) => item.id === ref.id)?.name ?? "";
    case "setting":
      return catalog.settings.find((item) => item.id === ref.id)?.name ?? "";
    default:
      return "";
  }
}

function searchCandidates(
  catalog: SettingCatalog,
  outline: Outline,
  query: string,
  from: LinkRef,
  existing: Association[],
): LinkRef[] {
  const taken = new Set(
    existing.map((item) => {
      const other = otherEnd(item, from);
      return `${other.kind}:${other.id}`;
    }),
  );
  const push = (items: { id: string; name?: string; title?: string }[], kind: LinkableKind) =>
    items
      .filter((item) => matchesNameQuery(item.name ?? item.title ?? "", query))
      .filter((item) => !(kind === from.kind && item.id === from.id))
      .filter((item) => !taken.has(`${kind}:${item.id}`))
      .map((item) => ({ kind, id: item.id }));
  return [
    ...push(outline.chapters, "chapter"),
    ...catalog.characters
      .filter((item) => matchesCharacterQuery(item, query))
      .filter((item) => !(from.kind === "character" && item.id === from.id))
      .filter((item) => !taken.has(`character:${item.id}`))
      .map((item) => ({ kind: "character" as const, id: item.id })),
    ...push(catalog.locations, "location"),
    ...push(catalog.events, "event"),
    ...push(catalog.settings, "setting"),
  ];
}

async function createKind(api: AppApi, kind: LinkableKind): Promise<{ id: string }> {
  switch (kind) {
    case "character":
      return api.createCharacter();
    case "location":
      return api.createLocation();
    case "event":
      return api.createEvent();
    case "setting":
      return api.createSettingEntry();
    default:
      throw new Error("不能新建这一类并关联");
  }
}
