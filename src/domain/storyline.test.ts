import { describe, expect, it } from "vitest";
import {
  deriveStorylineRoute,
  eventsNotOnAnyStoryline,
  excludeEvent,
  includeEventOnce,
  moveStorylineEvent,
} from "./storyline";

const document = { type: "doc", content: [] };

describe("includeEventOnce", () => {
  it("does not record the same event twice on one storyline", () => {
    expect(includeEventOnce(["e1"], "e1")).toEqual(["e1"]);
    expect(includeEventOnce(["e1"], "e2")).toEqual(["e1", "e2"]);
  });
});

describe("excludeEvent", () => {
  it("drops the membership and leaves the event id for the event list", () => {
    const remaining = excludeEvent(["e1", "e2"], "e1");
    expect(remaining).toEqual(["e2"]);
    expect(["e1", "e2"].filter((id) => id === "e1")).toEqual(["e1"]);
  });
});

describe("moveStorylineEvent", () => {
  it("reorders a recorded event", () => {
    expect(moveStorylineEvent(["e1", "e2", "e3"], "e2", "up")).toEqual(["e2", "e1", "e3"]);
    expect(moveStorylineEvent(["e1", "e2", "e3"], "e2", "down")).toEqual(["e1", "e3", "e2"]);
  });
});

describe("eventsNotOnAnyStoryline", () => {
  it("keeps events that are not recorded on any storyline", () => {
    const events = [{ id: "e1" }, { id: "e2" }, { id: "e3" }];
    const unlinked = eventsNotOnAnyStoryline(events, [{ eventIds: ["e1"] }]);
    expect(unlinked.map((event) => event.id)).toEqual(["e2", "e3"]);
  });
});

describe("deriveStorylineRoute", () => {
  it("keeps every recorded event in the chain while routing only events whose first location is marked", () => {
    const events = [
      { id: "e1", name: "离开山门", summary: "", description: document, storyTime: "" },
      { id: "e2", name: "林中遇袭", summary: "", description: document, storyTime: "" },
      { id: "e3", name: "抵达渡口", summary: "", description: document, storyTime: "" },
    ];
    const locations = [
      { id: "l1", name: "山门", summary: "", description: document, parentId: null, mark: { x: 0.2, y: 0.3 } },
      { id: "l2", name: "树林", summary: "", description: document, parentId: null, mark: null },
      { id: "l3", name: "渡口", summary: "", description: document, parentId: null, mark: { x: 0.8, y: 0.6 } },
    ];
    const associationsByEvent = {
      e1: [{ id: "a1", left: { kind: "location" as const, id: "l1" }, right: { kind: "event" as const, id: "e1" }, note: "" }],
      e2: [
        { id: "a2", left: { kind: "location" as const, id: "l2" }, right: { kind: "event" as const, id: "e2" }, note: "" },
        { id: "a3", left: { kind: "location" as const, id: "l3" }, right: { kind: "event" as const, id: "e2" }, note: "" },
      ],
      e3: [
        { id: "a4", left: { kind: "chapter" as const, id: "c1" }, right: { kind: "event" as const, id: "e3" }, note: "" },
        { id: "a5", left: { kind: "location" as const, id: "l3" }, right: { kind: "event" as const, id: "e3" }, note: "" },
      ],
    };

    const route = deriveStorylineRoute(
      { eventIds: ["e1", "e2", "e3"] },
      events,
      locations,
      associationsByEvent,
    );

    expect(route.chain.map(({ eventId, inclusionNumber, locationId }) => ({ eventId, inclusionNumber, locationId }))).toEqual([
      { eventId: "e1", inclusionNumber: 1, locationId: "l1" },
      { eventId: "e2", inclusionNumber: 2, locationId: "l2" },
      { eventId: "e3", inclusionNumber: 3, locationId: "l3" },
    ]);
    expect(route.stops.map(({ eventId, inclusionNumber, mark }) => ({ eventId, inclusionNumber, mark }))).toEqual([
      { eventId: "e1", inclusionNumber: 1, mark: { x: 0.2, y: 0.3 } },
      { eventId: "e3", inclusionNumber: 3, mark: { x: 0.8, y: 0.6 } },
    ]);
    expect(route.unlocated.map((item) => item.eventId)).toEqual(["e2"]);
  });

  it("keeps repeated visits readable at one map point without adding unrelated location relations", () => {
    const events = ["e2", "e3", "e1"].map((id) => ({ id, name: id, summary: "", description: document, storyTime: "" }));
    const location = { id: "l1", name: "山门", summary: "", description: document, parentId: null, mark: { x: 0, y: 1 } };
    const link = (eventId: string) => ({ id: eventId, left: { kind: "event" as const, id: eventId }, right: { kind: "location" as const, id: "l1" }, note: "" });
    const route = deriveStorylineRoute({ eventIds: ["e1", "e2", "e3"] }, events, [location], {
      e1: [link("e1")],
      e2: [{ id: "unrelated", left: { kind: "location", id: "l1" }, right: { kind: "location", id: "l2" }, note: "" }],
      e3: [link("e3")],
    });
    expect(route.markers.map((marker) => ({ mark: marker.mark, numbers: marker.visits.map((visit) => visit.inclusionNumber) }))).toEqual([
      { mark: { x: 0, y: 1 }, numbers: [1, 3] },
    ]);
    expect(route.unlocated.map((event) => event.eventId)).toEqual(["e2"]);
  });
});
