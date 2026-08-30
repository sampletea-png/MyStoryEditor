import { describe, expect, it } from "vitest";
import {
  mapAssetFileName,
  mapImageKindFromFileName,
  mapImageMimeType,
} from "./workMap";

describe("mapImageKindFromFileName", () => {
  it("accepts jpg, jpeg, png, and webp regardless of case", () => {
    expect(mapImageKindFromFileName("北境.jpg")).toBe("jpeg");
    expect(mapImageKindFromFileName("北境.JPEG")).toBe("jpeg");
    expect(mapImageKindFromFileName("map.Png")).toBe("png");
    expect(mapImageKindFromFileName("world.webp")).toBe("webp");
  });

  it("rejects types that are not png, jpg, or webp", () => {
    expect(() => mapImageKindFromFileName("map.gif")).toThrow("总图只支持 png、jpg 或 webp");
    expect(() => mapImageKindFromFileName("map")).toThrow("总图只支持 png、jpg 或 webp");
  });
});

describe("map asset names", () => {
  it("stores one canonical file per work so a later image replaces the old one", () => {
    expect(mapAssetFileName("jpeg")).toBe("map.jpg");
    expect(mapAssetFileName("png")).toBe("map.png");
    expect(mapAssetFileName("webp")).toBe("map.webp");
    expect(mapImageMimeType("jpeg")).toBe("image/jpeg");
    expect(mapImageMimeType("png")).toBe("image/png");
    expect(mapImageMimeType("webp")).toBe("image/webp");
  });
});
