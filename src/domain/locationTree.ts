export type LocationNode = {
  id: string;
  parentId: string | null;
};

export function wouldCreateLocationCycle(
  locations: readonly LocationNode[],
  id: string,
  parentId: string | null,
): boolean {
  if (parentId === null) {
    return false;
  }
  if (parentId === id) {
    return true;
  }
  const byId = new Map(locations.map((location) => [location.id, location]));
  let current: string | null = parentId;
  const seen = new Set<string>();
  while (current) {
    if (current === id || seen.has(current)) {
      return true;
    }
    seen.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}

export function promoteLocationChildren<T extends LocationNode>(
  locations: readonly T[],
  deletedId: string,
): T[] {
  const deleted = locations.find((location) => location.id === deletedId);
  const nextParent = deleted?.parentId ?? null;
  return locations
    .filter((location) => location.id !== deletedId)
    .map((location) =>
      location.parentId === deletedId ? { ...location, parentId: nextParent } : location,
    );
}
