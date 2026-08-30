import { describe, expect, it } from "vitest";
import {
  eventsNotOnAnyStoryline,
  excludeEvent,
  includeEventOnce,
  moveStorylineEvent,
} from "./storyline";

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
