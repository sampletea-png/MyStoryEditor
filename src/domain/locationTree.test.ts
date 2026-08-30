import { describe, expect, it } from "vitest";
import { promoteLocationChildren, wouldCreateLocationCycle } from "./locationTree";

const tree = [
  { id: "north", parentId: null },
  { id: "city", parentId: "north" },
  { id: "inn", parentId: "city" },
];

describe("wouldCreateLocationCycle", () => {
  it("rejects a location becoming its own ancestor", () => {
    expect(wouldCreateLocationCycle(tree, "north", "inn")).toBe(true);
    expect(wouldCreateLocationCycle(tree, "city", "city")).toBe(true);
    expect(wouldCreateLocationCycle(tree, "inn", "north")).toBe(false);
    expect(wouldCreateLocationCycle(tree, "inn", null)).toBe(false);
  });
});

describe("promoteLocationChildren", () => {
  it("lifts children to the deleted location's parent", () => {
    const next = promoteLocationChildren(tree, "city");
    expect(next.find((location) => location.id === "inn")?.parentId).toBe("north");
    expect(next.some((location) => location.id === "city")).toBe(false);
  });

  it("lifts children to the root when the deleted location has no parent", () => {
    const next = promoteLocationChildren(tree, "north");
    expect(next.find((location) => location.id === "city")?.parentId).toBeNull();
  });
});
