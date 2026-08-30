import { describe, expect, it } from "vitest";
import {
  containFittedRect,
  containerPointFromImage,
  imagePointFromContainer,
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

describe("contain image space", () => {
  const image43 = { width: 800, height: 600 };

  it("normalizes a click against the image intrinsic size, not the stage letterbox", () => {
    const fitted = containFittedRect({ width: 400, height: 400 }, image43);
    expect(fitted).toEqual({ x: 0, y: 50, width: 400, height: 300 });
    expect(imagePointFromContainer({ x: 200, y: 200 }, fitted)).toEqual({ x: 0.5, y: 0.5 });
    expect(imagePointFromContainer({ x: 200, y: 20 }, fitted)).toBeNull();
  });

  it("keeps a mark on the same image point after drags at 100% and 150% zoom, then a different aspect image", () => {
    const at100 = containFittedRect({ width: 400, height: 400 }, image43);
    const afterFirstDrag = imagePointFromContainer({ x: 120, y: 110 }, at100);
    expect(afterFirstDrag).toEqual({ x: 0.3, y: 0.2 });

    const at150 = containFittedRect({ width: 600, height: 600 }, image43);
    expect(containerPointFromImage(afterFirstDrag!, at150)).toEqual({ x: 180, y: 165 });
    const afterSecondDrag = imagePointFromContainer({ x: 360, y: 255 }, at150);
    expect(afterSecondDrag).toEqual({ x: 0.6, y: 0.4 });

    const wide = containFittedRect({ width: 400, height: 400 }, { width: 1600, height: 800 });
    expect(wide).toEqual({ x: 0, y: 100, width: 400, height: 200 });
    expect(containerPointFromImage(afterSecondDrag!, wide)).toEqual({ x: 240, y: 180 });
  });
});
