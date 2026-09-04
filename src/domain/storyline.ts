import type { Association } from "./association";
import type { Location, LocationMark, StoryEvent, Storyline } from "./setting";

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

export type StorylineChainEvent = {
  eventId: string;
  eventName: string;
  inclusionNumber: number;
  locationId: string | null;
  locationName: string | null;
  mark: LocationMark | null;
};

export type StorylineRoute = {
  chain: StorylineChainEvent[];
  stops: StorylineRouteStop[];
  unlocated: StorylineChainEvent[];
  markers: { mark: LocationMark; visits: StorylineRouteStop[] }[];
};

export type StorylineRouteStop = StorylineChainEvent & { mark: LocationMark };

function firstLocationId(
  eventId: string,
  associations: readonly Association[],
): string | null {
  for (const association of associations) {
    if (association.left.kind === "event" && association.left.id === eventId && association.right.kind === "location") {
      return association.right.id;
    }
    if (association.right.kind === "event" && association.right.id === eventId && association.left.kind === "location") {
      return association.left.id;
    }
  }
  return null;
}

// Association lists must be supplied in creation order. Choose the first
// location before checking its mark; a later marked location must not replace it.
export function deriveStorylineRoute(
  storyline: Pick<Storyline, "eventIds">,
  events: readonly StoryEvent[],
  locations: readonly Location[],
  associationsByEvent: Readonly<Record<string, readonly Association[]>>,
): StorylineRoute {
  const eventById = new Map(events.map((event) => [event.id, event]));
  const locationById = new Map(locations.map((location) => [location.id, location]));
  const chain = storyline.eventIds.flatMap((eventId, index) => {
    const event = eventById.get(eventId);
    if (!event) {
      return [];
    }
    const locationId = firstLocationId(eventId, associationsByEvent[eventId] ?? []);
    const location = locationId ? locationById.get(locationId) : undefined;
    return [{
      eventId,
      eventName: event.name,
      inclusionNumber: index + 1,
      locationId,
      locationName: location?.name ?? null,
      mark: location?.mark ?? null,
    }];
  });

  const stops = chain.filter((event): event is StorylineRouteStop => event.mark !== null);
  const markers = new Map<string, StorylineRoute["markers"][number]>();
  for (const stop of stops) {
    const key = `${stop.mark.x},${stop.mark.y}`;
    const marker = markers.get(key);
    if (marker) {
      marker.visits.push(stop);
    } else {
      markers.set(key, { mark: stop.mark, visits: [stop] });
    }
  }
  return {
    chain,
    stops,
    unlocated: chain.filter((event) => event.mark === null),
    markers: [...markers.values()],
  };
}
