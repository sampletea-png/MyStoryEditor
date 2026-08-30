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
