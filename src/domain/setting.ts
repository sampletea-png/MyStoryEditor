import type { TipTapNode } from "./wordCount";
import type { SettingCategory } from "./settingCategories";
import type { SettingKind } from "./settingNames";

export type { SettingCategory, SettingKind };

export type Character = {
  id: string;
  name: string;
  aliases: string[];
  summary: string;
  appearance: TipTapNode;
  personality: TipTapNode;
  background: TipTapNode;
};

export type LocationMark = {
  x: number;
  y: number;
};

export type Location = {
  id: string;
  name: string;
  summary: string;
  description: TipTapNode;
  parentId: string | null;
  mark: LocationMark | null;
};

export type StoryEvent = {
  id: string;
  name: string;
  summary: string;
  description: TipTapNode;
  storyTime: string;
};

export type Storyline = {
  id: string;
  name: string;
  summary: string;
  eventIds: string[];
};

export type SettingEntry = {
  id: string;
  name: string;
  categoryId: string;
  summary: string;
  body: TipTapNode;
};

export type SettingCatalog = {
  categories: SettingCategory[];
  characters: Character[];
  locations: Location[];
  events: StoryEvent[];
  storylines: Storyline[];
  settings: SettingEntry[];
};

export type RecycleKind =
  | "volume"
  | "chapter"
  | "character"
  | "location"
  | "event"
  | "storyline"
  | "setting";

export type RecycleItem = {
  id: string;
  kind: RecycleKind;
  name: string;
  deletedAt: number;
};

export function emptyCatalog(categories: SettingCategory[]): SettingCatalog {
  return {
    categories,
    characters: [],
    locations: [],
    events: [],
    storylines: [],
    settings: [],
  };
}

export function parseAliases(text: string): string[] {
  return text
    .split(/[,，、]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function formatAliases(aliases: readonly string[]): string {
  return aliases.join("、");
}
