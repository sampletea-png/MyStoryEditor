export function includeEventOnce(eventIds: readonly string[], eventId: string): string[] {
  if (eventIds.includes(eventId)) {
    return [...eventIds];
  }
  return [...eventIds, eventId];
}

export function excludeEvent(eventIds: readonly string[], eventId: string): string[] {
  return eventIds.filter((id) => id !== eventId);
}

export function moveStorylineEvent(
  eventIds: readonly string[],
  eventId: string,
  direction: "up" | "down",
): string[] {
  const next = [...eventIds];
  const index = next.indexOf(eventId);
  if (index < 0) {
    return next;
  }
  const swap = direction === "up" ? index - 1 : index + 1;
  if (swap < 0 || swap >= next.length) {
    return next;
  }
  const current = next[index]!;
  next[index] = next[swap]!;
  next[swap] = current;
  return next;
}

export function eventsNotOnAnyStoryline<T extends { id: string }>(
  events: readonly T[],
  storylines: readonly { eventIds: readonly string[] }[],
): T[] {
  const linked = new Set(storylines.flatMap((storyline) => storyline.eventIds));
  return events.filter((event) => !linked.has(event.id));
}
