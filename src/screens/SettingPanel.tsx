import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppApi } from "../api/types";
import { createAutosaveSession } from "../domain/autosave";
import { wouldCreateLocationCycle } from "../domain/locationTree";
import { canDeleteCategory, categoryNameTaken } from "../domain/settingCategories";
import { matchesCharacterQuery, matchesNameQuery } from "../domain/settingFilter";
import {
  displaySettingName,
  type SettingKind,
} from "../domain/settingNames";
import { eventsNotOnAnyStoryline } from "../domain/storyline";
import {
  formatAliases,
  parseAliases,
  type Character,
  type Location,
  type RecycleItem,
  type RecycleKind,
  type SettingCatalog,
  type SettingEntry,
  type StoryEvent,
  type Storyline,
} from "../domain/setting";
import type { Outline } from "../domain/outline";
import { FieldEditor } from "../editor/FieldEditor";

type Tab = SettingKind | "recycle";

type Props = {
  api: AppApi;
  catalog: SettingCatalog;
  onCatalogChange: (catalog: SettingCatalog) => void;
  onOutlineChange: (outline: Outline) => void;
};

const TABS: { id: Tab; label: string }[] = [
  { id: "character", label: "角色" },
  { id: "location", label: "地点" },
  { id: "event", label: "事件" },
  { id: "storyline", label: "故事线" },
  { id: "setting", label: "设定" },
  { id: "recycle", label: "回收站" },
];

const RECYCLE_KIND: Record<RecycleKind, string> = {
  volume: "卷",
  chapter: "章节",
  character: "角色",
  location: "地点",
  event: "事件",
  storyline: "故事线",
  setting: "设定条目",
};

export function SettingPanel({ api, catalog, onCatalogChange, onOutlineChange }: Props) {
  const [tab, setTab] = useState<Tab>("character");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState<"all" | "unlinked">("all");
  const [character, setCharacter] = useState<Character | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [event, setEvent] = useState<StoryEvent | null>(null);
  const [storyline, setStoryline] = useState<Storyline | null>(null);
  const [setting, setSetting] = useState<SettingEntry | null>(null);
  const [recycle, setRecycle] = useState<RecycleItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [categoryDraft, setCategoryDraft] = useState("");

  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;
  const characterRef = useRef(character);
  const locationRef = useRef(location);
  const eventRef = useRef(event);
  const storylineRef = useRef(storyline);
  const settingRef = useRef(setting);
  characterRef.current = character;
  locationRef.current = location;
  eventRef.current = event;
  storylineRef.current = storyline;
  settingRef.current = setting;
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const persist = useCallback(async () => {
    const currentTab = tabRef.current;
    if (currentTab === "character" && characterRef.current) {
      await api.saveCharacter(characterRef.current);
      patchCatalog(catalogRef.current, onCatalogChange, "characters", characterRef.current);
    } else if (currentTab === "location" && locationRef.current) {
      onCatalogChange(await api.saveLocation(locationRef.current));
    } else if (currentTab === "event" && eventRef.current) {
      await api.saveEvent(eventRef.current);
      patchCatalog(catalogRef.current, onCatalogChange, "events", eventRef.current);
    } else if (currentTab === "storyline" && storylineRef.current) {
      await api.saveStoryline(storylineRef.current);
      patchCatalog(catalogRef.current, onCatalogChange, "storylines", storylineRef.current);
    } else if (currentTab === "setting" && settingRef.current) {
      await api.saveSettingEntry(settingRef.current);
      patchCatalog(catalogRef.current, onCatalogChange, "settings", settingRef.current);
    }
  }, [api, onCatalogChange]);

  const persistRef = useRef(persist);
  persistRef.current = persist;
  const autosave = useMemo(() => createAutosaveSession(() => persistRef.current(), 3000), []);

  useEffect(() => () => autosave.dispose(), [autosave]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        void autosave.saveNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [autosave]);

  const refreshRecycle = async () => {
    setRecycle(await api.listWorkRecycle());
  };

  useEffect(() => {
    if (tab === "recycle") {
      void refreshRecycle();
    }
  }, [tab]);

  const flushThen = async (next: () => void | Promise<void>) => {
    await autosave.saveNow();
    await next();
  };

  const selectCharacter = (item: Character) => {
    void flushThen(() => {
      setSelectedId(item.id);
      setCharacter(structuredClone(item));
      setLocation(null);
      setEvent(null);
      setStoryline(null);
      setSetting(null);
    });
  };

  const characters = catalog.characters.filter((item) => matchesCharacterQuery(item, query));
  const locations = flattenLocations(catalog.locations).filter(({ location: item }) =>
    matchesNameQuery(item.name, query),
  );
  const events = (
    eventFilter === "unlinked"
      ? eventsNotOnAnyStoryline(catalog.events, catalog.storylines)
      : catalog.events
  ).filter((item) => matchesNameQuery(item.name, query));
  const storylines = catalog.storylines.filter((item) => matchesNameQuery(item.name, query));
  const settings = catalog.settings.filter((item) => matchesNameQuery(item.name, query));

  return (
    <aside className="side-panel setting-panel">
      <div className="setting-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? "active" : ""}
            onClick={() => {
              void flushThen(() => {
                setTab(item.id);
                setQuery("");
                setSelectedId(null);
                setCharacter(null);
                setLocation(null);
                setEvent(null);
                setStoryline(null);
                setSetting(null);
              });
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {error ? <p className="error">{error}</p> : null}
      {tab !== "recycle" ? (
        <div className="setting-list-head">
          <input
            value={query}
            placeholder="按名称筛选"
            onChange={(event) => setQuery(event.target.value)}
          />
          {tab === "event" ? (
            <label className="muted">
              <input
                type="checkbox"
                checked={eventFilter === "unlinked"}
                onChange={(event) => setEventFilter(event.target.checked ? "unlinked" : "all")}
              />
              未入任何故事线
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void flushThen(async () => {
                try {
                  setError(null);
                  if (tab === "character") {
                    const created = await api.createCharacter();
                    onCatalogChange({
                      ...catalogRef.current,
                      characters: [...catalogRef.current.characters, created],
                    });
                    setSelectedId(created.id);
                    setCharacter(created);
                  } else if (tab === "location") {
                    const parentId =
                      selectedId && catalogRef.current.locations.some((item) => item.id === selectedId)
                        ? selectedId
                        : null;
                    const created = await api.createLocation(parentId);
                    onCatalogChange({
                      ...catalogRef.current,
                      locations: [...catalogRef.current.locations, created],
                    });
                    setSelectedId(created.id);
                    setLocation(created);
                  } else if (tab === "event") {
                    const created = await api.createEvent();
                    onCatalogChange({
                      ...catalogRef.current,
                      events: [...catalogRef.current.events, created],
                    });
                    setSelectedId(created.id);
                    setEvent(created);
                  } else if (tab === "storyline") {
                    const created = await api.createStoryline();
                    onCatalogChange({
                      ...catalogRef.current,
                      storylines: [...catalogRef.current.storylines, created],
                    });
                    setSelectedId(created.id);
                    setStoryline(created);
                  } else if (tab === "setting") {
                    const created = await api.createSettingEntry();
                    onCatalogChange({
                      ...catalogRef.current,
                      settings: [...catalogRef.current.settings, created],
                    });
                    setSelectedId(created.id);
                    setSetting(created);
                  }
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                }
              });
            }}
          >
            新建
          </button>
        </div>
      ) : null}

      {tab === "character" ? (
        <ul className="setting-list">
          {characters.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={selectedId === item.id ? "tree-open selected" : "tree-open"}
                onClick={() => selectCharacter(item)}
              >
                {displaySettingName("character", item.name)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {tab === "location" ? (
        <ul className="setting-list">
          {locations.map(({ location: item, depth }) => (
            <li key={item.id} style={{ paddingLeft: `${depth}rem` }}>
              <button
                type="button"
                className={selectedId === item.id ? "tree-open selected" : "tree-open"}
                onClick={() =>
                  void flushThen(() => {
                    setSelectedId(item.id);
                    setLocation(structuredClone(item));
                    setCharacter(null);
                  })
                }
              >
                {displaySettingName("location", item.name)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {tab === "event" ? (
        <ul className="setting-list">
          {events.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={selectedId === item.id ? "tree-open selected" : "tree-open"}
                onClick={() =>
                  void flushThen(() => {
                    setSelectedId(item.id);
                    setEvent(structuredClone(item));
                    setCharacter(null);
                  })
                }
              >
                {displaySettingName("event", item.name)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {tab === "storyline" ? (
        <ul className="setting-list">
          {storylines.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={selectedId === item.id ? "tree-open selected" : "tree-open"}
                onClick={() =>
                  void flushThen(() => {
                    setSelectedId(item.id);
                    setStoryline(structuredClone(item));
                    setCharacter(null);
                  })
                }
              >
                {displaySettingName("storyline", item.name)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {tab === "setting" ? (
        <>
          <div className="category-box">
            <strong>设定分类</strong>
            {catalog.categories.map((category) => (
              <div key={category.id} className="tree-item">
                <input
                  value={category.name}
                  disabled={!canDeleteCategory(category)}
                  onChange={(event) => {
                    const name = event.target.value;
                    onCatalogChange({
                      ...catalog,
                      categories: catalog.categories.map((item) =>
                        item.id === category.id ? { ...item, name } : item,
                      ),
                    });
                  }}
                  onBlur={() => {
                    if (canDeleteCategory(category)) {
                      void api.renameCategory(category.id, category.name).catch((err) => {
                        setError(err instanceof Error ? err.message : String(err));
                      });
                    }
                  }}
                />
                {canDeleteCategory(category) ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`删除分类「${category.name}」？其下设定条目将改归未分类。`)) {
                        void api.deleteCategory(category.id).then(onCatalogChange).catch((err) => {
                          setError(err instanceof Error ? err.message : String(err));
                        });
                      }
                    }}
                  >
                    删
                  </button>
                ) : (
                  <span className="muted">不可删</span>
                )}
              </div>
            ))}
            <div className="row">
              <input
                value={categoryDraft}
                placeholder="新分类名"
                onChange={(event) => setCategoryDraft(event.target.value)}
              />
              <button
                type="button"
                onClick={() => {
                  if (categoryNameTaken(catalog.categories, categoryDraft)) {
                    setError("同一作品内分类名不可重复");
                    return;
                  }
                  void api
                    .createCategory(categoryDraft)
                    .then((created) => {
                      setCategoryDraft("");
                      onCatalogChange({
                        ...catalogRef.current,
                        categories: [...catalogRef.current.categories, created],
                      });
                    })
                    .catch((err) => setError(err instanceof Error ? err.message : String(err)));
                }}
              >
                添加
              </button>
            </div>
          </div>
          <ul className="setting-list">
            {settings.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={selectedId === item.id ? "tree-open selected" : "tree-open"}
                  onClick={() =>
                    void flushThen(() => {
                      setSelectedId(item.id);
                      setSetting(structuredClone(item));
                      setCharacter(null);
                    })
                  }
                >
                  {displaySettingName("setting", item.name)}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {tab === "recycle" ? (
        <ul className="setting-list">
          {recycle.length === 0 ? <li className="muted">作品回收站是空的。</li> : null}
          {recycle.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="recycle-row">
              <span>
                {RECYCLE_KIND[item.kind]} · {recycleLabel(item)}
              </span>
              <button
                type="button"
                onClick={() => {
                  void api.restoreRecycleItem(item.kind, item.id).then(async (result) => {
                    onCatalogChange(result.catalog);
                    onOutlineChange(result.outline);
                    await refreshRecycle();
                  });
                }}
              >
                恢复
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("永久删除后无法恢复。")) {
                    void api.permanentlyDeleteRecycleItem(item.kind, item.id).then(refreshRecycle);
                  }
                }}
              >
                永久删除
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {character && tab === "character" ? (
        <CharacterCard
          character={character}
          setCharacter={(next) => {
            setCharacter(next);
            characterRef.current = next;
            patchCatalog(catalogRef.current, onCatalogChange, "characters", next);
            autosave.notifyChange(false);
          }}
          onRichChange={(patch, composing) => {
            const current = characterRef.current;
            if (!current) {
              return;
            }
            const next = { ...current, ...patch };
            setCharacter(next);
            characterRef.current = next;
            patchCatalog(catalogRef.current, onCatalogChange, "characters", next);
            autosave.notifyChange(composing);
          }}
          onDelete={() => {
            if (!window.confirm(`删除「${displaySettingName("character", character.name)}」？`)) {
              return;
            }
            void api.deleteCharacter(character.id).then(() => {
              onCatalogChange({
                ...catalogRef.current,
                characters: catalogRef.current.characters.filter((item) => item.id !== character.id),
              });
              setCharacter(null);
              setSelectedId(null);
            });
          }}
        />
      ) : null}

      {location && tab === "location" ? (
        <LocationCard
          location={location}
          locations={catalog.locations}
          setLocation={(next) => {
            setLocation(next);
            locationRef.current = next;
            autosave.notifyChange(false);
          }}
          onRichChange={(patch, composing) => {
            const current = locationRef.current;
            if (!current) {
              return;
            }
            const next = { ...current, ...patch };
            setLocation(next);
            locationRef.current = next;
            autosave.notifyChange(composing);
          }}
          onDelete={() => {
            if (!window.confirm(`删除「${displaySettingName("location", location.name)}」？下级将提升到其原上级。`)) {
              return;
            }
            void api.deleteLocation(location.id).then((next) => {
              onCatalogChange(next);
              setLocation(null);
              setSelectedId(null);
            });
          }}
        />
      ) : null}

      {event && tab === "event" ? (
        <EventCard
          event={event}
          setEvent={(next) => {
            setEvent(next);
            eventRef.current = next;
            patchCatalog(catalogRef.current, onCatalogChange, "events", next);
            autosave.notifyChange(false);
          }}
          onRichChange={(patch, composing) => {
            const current = eventRef.current;
            if (!current) {
              return;
            }
            const next = { ...current, ...patch };
            setEvent(next);
            eventRef.current = next;
            patchCatalog(catalogRef.current, onCatalogChange, "events", next);
            autosave.notifyChange(composing);
          }}
          onDelete={() => {
            if (!window.confirm(`删除「${displaySettingName("event", event.name)}」？`)) {
              return;
            }
            void api.deleteEvent(event.id).then(() => {
              onCatalogChange({
                ...catalogRef.current,
                events: catalogRef.current.events.filter((item) => item.id !== event.id),
              });
              setEvent(null);
              setSelectedId(null);
            });
          }}
        />
      ) : null}

      {storyline && tab === "storyline" ? (
        <StorylineCard
          storyline={storyline}
          events={catalog.events}
          setStoryline={(next) => {
            setStoryline(next);
            storylineRef.current = next;
            patchCatalog(catalogRef.current, onCatalogChange, "storylines", next);
            autosave.notifyChange(false);
          }}
          onMembership={async (next) => {
            setStoryline(next);
            storylineRef.current = next;
            patchCatalog(catalogRef.current, onCatalogChange, "storylines", next);
          }}
          api={api}
          onDelete={() => {
            if (!window.confirm(`删除「${displaySettingName("storyline", storyline.name)}」？收录的事件不会被删除。`)) {
              return;
            }
            void api.deleteStoryline(storyline.id).then(() => {
              onCatalogChange({
                ...catalogRef.current,
                storylines: catalogRef.current.storylines.filter((item) => item.id !== storyline.id),
              });
              setStoryline(null);
              setSelectedId(null);
            });
          }}
        />
      ) : null}

      {setting && tab === "setting" ? (
        <SettingCard
          entry={setting}
          categories={catalog.categories}
          setEntry={(next) => {
            setSetting(next);
            settingRef.current = next;
            patchCatalog(catalogRef.current, onCatalogChange, "settings", next);
            autosave.notifyChange(false);
          }}
          onRichChange={(patch, composing) => {
            const current = settingRef.current;
            if (!current) {
              return;
            }
            const next = { ...current, ...patch };
            setSetting(next);
            settingRef.current = next;
            patchCatalog(catalogRef.current, onCatalogChange, "settings", next);
            autosave.notifyChange(composing);
          }}
          onDelete={() => {
            if (!window.confirm(`删除「${displaySettingName("setting", setting.name)}」？`)) {
              return;
            }
            void api.deleteSettingEntry(setting.id).then(() => {
              onCatalogChange({
                ...catalogRef.current,
                settings: catalogRef.current.settings.filter((item) => item.id !== setting.id),
              });
              setSetting(null);
              setSelectedId(null);
            });
          }}
        />
      ) : null}
    </aside>
  );
}

function patchCatalog<K extends "characters" | "events" | "storylines" | "settings">(
  catalog: SettingCatalog,
  onCatalogChange: (catalog: SettingCatalog) => void,
  key: K,
  item: SettingCatalog[K][number],
) {
  onCatalogChange({
    ...catalog,
    [key]: catalog[key].some((entry) => entry.id === item.id)
      ? catalog[key].map((entry) => (entry.id === item.id ? item : entry))
      : [...catalog[key], item],
  });
}

function recycleLabel(item: RecycleItem): string {
  switch (item.kind) {
    case "character":
    case "location":
    case "event":
    case "storyline":
    case "setting":
      return displaySettingName(item.kind, item.name);
    case "volume":
      return item.name.trim() === "" ? "未命名卷" : item.name;
    case "chapter":
      return item.name.trim() === "" ? "未命名章节" : item.name;
  }
}

function flattenLocations(locations: Location[]): { location: Location; depth: number }[] {
  const byParent = new Map<string | null, Location[]>();
  for (const item of locations) {
    const list = byParent.get(item.parentId) ?? [];
    list.push(item);
    byParent.set(item.parentId, list);
  }
  const result: { location: Location; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const item of byParent.get(parentId) ?? []) {
      result.push({ location: item, depth });
      walk(item.id, depth + 1);
    }
  };
  walk(null, 0);
  const seen = new Set(result.map((item) => item.location.id));
  for (const item of locations) {
    if (!seen.has(item.id)) {
      result.push({ location: item, depth: 0 });
    }
  }
  return result;
}

function CharacterCard({
  character,
  setCharacter,
  onRichChange,
  onDelete,
}: {
  character: Character;
  setCharacter: (next: Character) => void;
  onRichChange: (patch: Partial<Character>, composing: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <div className="setting-card">
      <label>
        名称
        <input
          value={character.name}
          placeholder="未命名角色"
          onChange={(event) => setCharacter({ ...character, name: event.target.value })}
        />
      </label>
      <label>
        别名
        <input
          value={formatAliases(character.aliases)}
          placeholder="用顿号或逗号分隔"
          onChange={(event) =>
            setCharacter({ ...character, aliases: parseAliases(event.target.value) })
          }
        />
      </label>
      <label>
        摘要
        <input
          value={character.summary}
          onChange={(event) => setCharacter({ ...character, summary: event.target.value })}
        />
      </label>
      <span>外貌</span>
      <FieldEditor
        fieldId={`${character.id}-appearance`}
        document={character.appearance}
        onChange={(document, composing) => onRichChange({ appearance: document }, composing)}
      />
      <span>性格</span>
      <FieldEditor
        fieldId={`${character.id}-personality`}
        document={character.personality}
        onChange={(document, composing) => onRichChange({ personality: document }, composing)}
      />
      <span>背景</span>
      <FieldEditor
        fieldId={`${character.id}-background`}
        document={character.background}
        onChange={(document, composing) => onRichChange({ background: document }, composing)}
      />
      <button type="button" onClick={onDelete}>
        删除角色
      </button>
    </div>
  );
}

function LocationCard({
  location,
  locations,
  setLocation,
  onRichChange,
  onDelete,
}: {
  location: Location;
  locations: Location[];
  setLocation: (next: Location) => void;
  onRichChange: (patch: Partial<Location>, composing: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <div className="setting-card">
      <label>
        名称
        <input
          value={location.name}
          placeholder="未命名地点"
          onChange={(event) => setLocation({ ...location, name: event.target.value })}
        />
      </label>
      <label>
        摘要
        <input
          value={location.summary}
          onChange={(event) => setLocation({ ...location, summary: event.target.value })}
        />
      </label>
      <label>
        上级地点
        <select
          value={location.parentId ?? ""}
          onChange={(event) =>
            setLocation({ ...location, parentId: event.target.value || null })
          }
        >
          <option value="">（无，位于根）</option>
          {locations
            .filter((item) => !wouldCreateLocationCycle(locations, location.id, item.id))
            .map((item) => (
              <option key={item.id} value={item.id}>
                {displaySettingName("location", item.name)}
              </option>
            ))}
        </select>
      </label>
      <span>描述</span>
      <FieldEditor
        fieldId={`${location.id}-description`}
        document={location.description}
        onChange={(document, composing) => onRichChange({ description: document }, composing)}
      />
      <button type="button" onClick={onDelete}>
        删除地点
      </button>
    </div>
  );
}

function EventCard({
  event,
  setEvent,
  onRichChange,
  onDelete,
}: {
  event: StoryEvent;
  setEvent: (next: StoryEvent) => void;
  onRichChange: (patch: Partial<StoryEvent>, composing: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <div className="setting-card">
      <label>
        名称
        <input
          value={event.name}
          placeholder="未命名事件"
          onChange={(change) => setEvent({ ...event, name: change.target.value })}
        />
      </label>
      <label>
        摘要
        <input
          value={event.summary}
          onChange={(change) => setEvent({ ...event, summary: change.target.value })}
        />
      </label>
      <label>
        故事时间
        <input
          value={event.storyTime}
          onChange={(change) => setEvent({ ...event, storyTime: change.target.value })}
        />
      </label>
      <span>描述</span>
      <FieldEditor
        fieldId={`${event.id}-description`}
        document={event.description}
        onChange={(document, composing) => onRichChange({ description: document }, composing)}
      />
      <button type="button" onClick={onDelete}>
        删除事件
      </button>
    </div>
  );
}

function StorylineCard({
  storyline,
  events,
  setStoryline,
  onMembership,
  api,
  onDelete,
}: {
  storyline: Storyline;
  events: StoryEvent[];
  setStoryline: (next: Storyline) => void;
  onMembership: (next: Storyline) => void | Promise<void>;
  api: AppApi;
  onDelete: () => void;
}) {
  const recorded = storyline.eventIds
    .map((id) => events.find((item) => item.id === id))
    .filter((item): item is StoryEvent => Boolean(item));
  const available = events.filter((item) => !storyline.eventIds.includes(item.id));
  return (
    <div className="setting-card">
      <label>
        名称
        <input
          value={storyline.name}
          placeholder="未命名故事线"
          onChange={(event) => setStoryline({ ...storyline, name: event.target.value })}
        />
      </label>
      <label>
        摘要
        <input
          value={storyline.summary}
          onChange={(event) => setStoryline({ ...storyline, summary: event.target.value })}
        />
      </label>
      <strong>收录的事件</strong>
      {recorded.map((item) => (
        <div key={item.id} className="tree-item">
          <span>{displaySettingName("event", item.name)}</span>
          <button
            type="button"
            onClick={() =>
              void api.moveStorylineEvent(storyline.id, item.id, "up").then(onMembership)
            }
          >
            上
          </button>
          <button
            type="button"
            onClick={() =>
              void api.moveStorylineEvent(storyline.id, item.id, "down").then(onMembership)
            }
          >
            下
          </button>
          <button
            type="button"
            onClick={() =>
              void api.removeEventFromStoryline(storyline.id, item.id).then(onMembership)
            }
          >
            移除
          </button>
        </div>
      ))}
      {available.length > 0 ? (
        <label>
          加入事件
          <select
            value=""
            onChange={(change) => {
              const eventId = change.target.value;
              if (eventId) {
                void api.addEventToStoryline(storyline.id, eventId).then(onMembership);
              }
            }}
          >
            <option value="">选择事件</option>
            {available.map((item) => (
              <option key={item.id} value={item.id}>
                {displaySettingName("event", item.name)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="muted">没有可加入的事件。事件仍可独立存在。</p>
      )}
      <button type="button" onClick={onDelete}>
        删除故事线
      </button>
    </div>
  );
}

function SettingCard({
  entry,
  categories,
  setEntry,
  onRichChange,
  onDelete,
}: {
  entry: SettingEntry;
  categories: SettingCatalog["categories"];
  setEntry: (next: SettingEntry) => void;
  onRichChange: (patch: Partial<SettingEntry>, composing: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <div className="setting-card">
      <label>
        名称
        <input
          value={entry.name}
          placeholder="未命名设定"
          onChange={(event) => setEntry({ ...entry, name: event.target.value })}
        />
      </label>
      <label>
        设定分类
        <select
          value={entry.categoryId}
          onChange={(event) => setEntry({ ...entry, categoryId: event.target.value })}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        摘要
        <input
          value={entry.summary}
          onChange={(event) => setEntry({ ...entry, summary: event.target.value })}
        />
      </label>
      <span>正文</span>
      <FieldEditor
        fieldId={`${entry.id}-body`}
        document={entry.body}
        onChange={(document, composing) => onRichChange({ body: document }, composing)}
      />
      <button type="button" onClick={onDelete}>
        删除设定条目
      </button>
    </div>
  );
}
