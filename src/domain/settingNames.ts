export type SettingKind = "character" | "location" | "event" | "storyline" | "setting";

const EMPTY_LABELS: Record<SettingKind, string> = {
  character: "未命名角色",
  location: "未命名地点",
  event: "未命名事件",
  storyline: "未命名故事线",
  setting: "未命名设定",
};

export function displaySettingName(kind: SettingKind, name: string): string {
  return name.trim() === "" ? EMPTY_LABELS[kind] : name;
}
