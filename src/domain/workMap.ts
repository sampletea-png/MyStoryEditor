export type MapImageKind = "jpeg" | "png" | "webp";

const KIND_BY_EXT: Record<string, MapImageKind> = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
};

export function mapImageKindFromFileName(fileName: string): MapImageKind {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
  const kind = KIND_BY_EXT[ext];
  if (!kind) {
    throw new Error("总图只支持 png、jpg 或 webp");
  }
  return kind;
}

export function mapAssetFileName(kind: MapImageKind): string {
  switch (kind) {
    case "jpeg":
      return "map.jpg";
    case "png":
      return "map.png";
    case "webp":
      return "map.webp";
  }
}

export function mapImageMimeType(kind: MapImageKind): "image/jpeg" | "image/png" | "image/webp" {
  switch (kind) {
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
  }
}

export type MapPoint = {
  x: number;
  y: number;
};

export type MapSize = {
  width: number;
  height: number;
};

export type MapRect = MapPoint & MapSize;

export function containFittedRect(container: MapSize, image: MapSize): MapRect {
  if (container.width <= 0 || container.height <= 0 || image.width <= 0 || image.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const scale = Math.min(container.width / image.width, container.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    x: (container.width - width) / 2,
    y: (container.height - height) / 2,
    width,
    height,
  };
}

export function imagePointFromContainer(pointer: MapPoint, fitted: MapRect): MapPoint | null {
  if (fitted.width <= 0 || fitted.height <= 0) {
    return null;
  }
  const x = (pointer.x - fitted.x) / fitted.width;
  const y = (pointer.y - fitted.y) / fitted.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) {
    return null;
  }
  return { x, y };
}

export function containerPointFromImage(mark: MapPoint, fitted: MapRect): MapPoint {
  return {
    x: fitted.x + mark.x * fitted.width,
    y: fitted.y + mark.y * fitted.height,
  };
}
