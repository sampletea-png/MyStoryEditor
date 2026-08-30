import { folderNameFromWorkName } from "../domain/folderName";
import {
  exportBody,
  type BodyExportFormat,
  type ChapterDocument,
} from "../domain/exportBody";
import type { Outline } from "../domain/outline";

export function browserDownloadFiles(): ExportFileHost {
  return {
    async pickSavePath(suggestedName) {
      return suggestedName;
    },
    async exists() {
      return false;
    },
    async confirmOverwrite() {
      return true;
    },
    async writeBytes(path, bytes) {
      const blob = new Blob([bytes]);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = path.split(/[/\\]/).pop() ?? path;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
  };
}

export type ExportFileHost = {
  pickSavePath: (suggestedName: string) => Promise<string | null>;
  exists: (path: string) => Promise<boolean>;
  confirmOverwrite: (path: string) => Promise<boolean>;
  writeBytes: (path: string, bytes: Uint8Array) => Promise<void>;
};

export type BodyExportRequest = {
  format: BodyExportFormat;
  volumeIds?: readonly string[];
  chapterIds?: readonly string[];
};

export type BodyExportResult =
  | { status: "saved"; path: string }
  | { status: "cancelled" }
  | { status: "overwrite-declined" };

const EXTENSION: Record<BodyExportFormat, string> = {
  plain: "txt",
  markdown: "md",
  docx: "docx",
};

export function suggestedExportFileName(workName: string, format: BodyExportFormat): string {
  return `${folderNameFromWorkName(workName)}.${EXTENSION[format]}`;
}

export function selectExportOutline(outline: Outline, request: BodyExportRequest): Outline {
  const hasVolumeFilter = request.volumeIds !== undefined;
  const hasChapterFilter = request.chapterIds !== undefined;
  if (!hasVolumeFilter && !hasChapterFilter) {
    return outline;
  }

  const volumeSet = hasVolumeFilter ? new Set(request.volumeIds) : null;
  const chapterSet = hasChapterFilter ? new Set(request.chapterIds) : null;

  const chapters = outline.chapters.filter((chapter) => {
    if (chapterSet?.has(chapter.id)) {
      return true;
    }
    return Boolean(volumeSet && chapter.volumeId && volumeSet.has(chapter.volumeId));
  });

  const keptVolumeIds = new Set(
    chapters.map((chapter) => chapter.volumeId).filter((id): id is string => id !== null),
  );
  if (volumeSet) {
    for (const id of volumeSet) {
      keptVolumeIds.add(id);
    }
  }

  return {
    volumes: outline.volumes.filter((volume) => keptVolumeIds.has(volume.id)),
    chapters,
  };
}

export async function runBodyExport(
  input: {
    workName: string;
    outline: Outline;
    chapters: readonly ChapterDocument[];
    request: BodyExportRequest;
  },
  files: ExportFileHost,
): Promise<BodyExportResult> {
  const outline = selectExportOutline(input.outline, input.request);
  const selectedIds = new Set(outline.chapters.map((chapter) => chapter.id));
  const chapters = input.chapters.filter((chapter) => selectedIds.has(chapter.id));
  const bytes = await exportBody({
    outline,
    chapters,
    format: input.request.format,
  });
  const path = await files.pickSavePath(
    suggestedExportFileName(input.workName, input.request.format),
  );
  if (!path) {
    return { status: "cancelled" };
  }
  if (await files.exists(path)) {
    if (!(await files.confirmOverwrite(path))) {
      return { status: "overwrite-declined" };
    }
  }
  await files.writeBytes(path, bytes);
  return { status: "saved", path };
}
