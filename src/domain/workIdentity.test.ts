import { describe, expect, it } from "vitest";
import { assignUniqueIdentities } from "./workIdentity";

describe("assignUniqueIdentities", () => {
  it("gives a copied package a new internal identity", () => {
    const copied = {
      path: "D:/lib/北境行纪-copy",
      manifest: {
        id: "same-id",
        name: "北境行纪",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    };
    const original = {
      path: "D:/lib/北境行纪",
      manifest: { ...copied.manifest },
    };
    const result = assignUniqueIdentities([original, copied], () => "new-id");
    expect(result.packages[0]?.manifest.id).toBe("same-id");
    expect(result.packages[1]?.manifest.id).toBe("new-id");
    expect(result.rewrittenPaths).toEqual(["D:/lib/北境行纪-copy"]);
  });
});
