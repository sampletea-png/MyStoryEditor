export const LINKABLE_KINDS = ["chapter", "character", "location", "event", "setting"] as const;

export type LinkableKind = (typeof LINKABLE_KINDS)[number];

export type LinkRef = {
  kind: LinkableKind;
  id: string;
};

export type Association = {
  id: string;
  left: LinkRef;
  right: LinkRef;
  note: string;
};

const KIND_ORDER: Record<LinkableKind, number> = {
  chapter: 0,
  character: 1,
  location: 2,
  event: 3,
  setting: 4,
};

export function isLinkableKind(kind: string): kind is LinkableKind {
  return (LINKABLE_KINDS as readonly string[]).includes(kind);
}

export function compareRefs(a: LinkRef, b: LinkRef): number {
  return KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id.localeCompare(b.id);
}

export function canonicalizePair(a: LinkRef, b: LinkRef): [LinkRef, LinkRef] {
  return compareRefs(a, b) <= 0 ? [a, b] : [b, a];
}

export function pairKey(a: LinkRef, b: LinkRef): string {
  const [left, right] = canonicalizePair(a, b);
  return `${left.kind}:${left.id}|${right.kind}:${right.id}`;
}

export function isSelfLink(a: LinkRef, b: LinkRef): boolean {
  return a.kind === b.kind && a.id === b.id;
}

export function findPair<T extends { left: LinkRef; right: LinkRef }>(
  items: readonly T[],
  a: LinkRef,
  b: LinkRef,
): T | undefined {
  const key = pairKey(a, b);
  return items.find((item) => pairKey(item.left, item.right) === key);
}

export function otherEnd(association: { left: LinkRef; right: LinkRef }, from: LinkRef): LinkRef {
  if (association.left.kind === from.kind && association.left.id === from.id) {
    return association.right;
  }
  return association.left;
}

export const LINKABLE_LABEL: Record<LinkableKind, string> = {
  chapter: "章节",
  character: "角色",
  location: "地点",
  event: "事件",
  setting: "设定条目",
};

const ROLLUP_KINDS = new Set<LinkableKind>(["chapter", "character", "location"]);

export function storylineAssociationRollup(
  eventIds: readonly string[],
  associations: readonly { left: LinkRef; right: LinkRef }[],
): LinkRef[] {
  const events = new Set(eventIds);
  const seen = new Set<string>();
  const result: LinkRef[] = [];
  for (const item of associations) {
    let other: LinkRef | null = null;
    if (item.left.kind === "event" && events.has(item.left.id)) {
      other = item.right;
    } else if (item.right.kind === "event" && events.has(item.right.id)) {
      other = item.left;
    }
    if (!other || !ROLLUP_KINDS.has(other.kind)) {
      continue;
    }
    const key = `${other.kind}:${other.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(other);
  }
  return result.sort(compareRefs);
}
