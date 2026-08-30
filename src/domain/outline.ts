export type ChapterStatus = "初稿" | "修订中" | "定稿";

export type Volume = {
  id: string;
  title: string;
  sortOrder: number;
};

export type Chapter = {
  id: string;
  volumeId: string | null;
  title: string;
  status: ChapterStatus;
  sortOrder: number;
};

export type Outline = {
  volumes: Volume[];
  chapters: Chapter[];
};

export function displayChapterTitle(title: string): string {
  return title.trim() === "" ? "未命名章节" : title;
}

export function displayVolumeTitle(title: string): string {
  return title.trim() === "" ? "未命名卷" : title;
}

export function hasVolumes(outline: Outline): boolean {
  return outline.volumes.length > 0;
}

export function canCreateChapterAtRoot(outline: Outline): boolean {
  return !hasVolumes(outline);
}

function nextSortOrder(items: { sortOrder: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;
}

function resequence(chapters: Chapter[]): Chapter[] {
  const grouped = new Map<string | null, Chapter[]>();
  for (const chapter of chapters) {
    const key = chapter.volumeId;
    const list = grouped.get(key) ?? [];
    list.push(chapter);
    grouped.set(key, list);
  }
  const result: Chapter[] = [];
  for (const list of grouped.values()) {
    list
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .forEach((chapter, index) => {
        result.push({ ...chapter, sortOrder: index });
      });
  }
  return result;
}

export function createFirstVolume(
  outline: Outline,
  volume: Volume,
): Outline {
  if (hasVolumes(outline)) {
    return {
      ...outline,
      volumes: [...outline.volumes, volume],
    };
  }
  return {
    volumes: [volume],
    chapters: outline.chapters.map((chapter) => ({
      ...chapter,
      volumeId: volume.id,
    })),
  };
}

export function cancelVolumes(outline: Outline): Outline {
  return {
    volumes: [],
    chapters: resequence(
      outline.chapters.map((chapter, index) => ({
        ...chapter,
        volumeId: null,
        sortOrder: index,
      })),
    ),
  };
}

export function insertChapter(
  outline: Outline,
  chapter: Omit<Chapter, "sortOrder" | "volumeId"> & {
    volumeId?: string | null;
  },
  options: { afterChapterId?: string | null; selectedVolumeId?: string | null },
): Outline {
  let volumeId: string | null = null;
  let sortOrder = 0;

  if (hasVolumes(outline)) {
    const after = options.afterChapterId
      ? outline.chapters.find((item) => item.id === options.afterChapterId)
      : undefined;
    volumeId = after?.volumeId ?? options.selectedVolumeId ?? outline.volumes[0]?.id ?? null;
    const siblings = outline.chapters.filter((item) => item.volumeId === volumeId);
    if (after && after.volumeId === volumeId) {
      sortOrder = after.sortOrder + 1;
      const shifted = outline.chapters.map((item) =>
        item.volumeId === volumeId && item.sortOrder >= sortOrder
          ? { ...item, sortOrder: item.sortOrder + 1 }
          : item,
      );
      return {
        ...outline,
        chapters: [
          ...shifted,
          { ...chapter, volumeId, sortOrder, status: chapter.status },
        ],
      };
    }
    sortOrder = nextSortOrder(siblings);
  } else {
    const after = options.afterChapterId
      ? outline.chapters.find((item) => item.id === options.afterChapterId)
      : undefined;
    if (after) {
      sortOrder = after.sortOrder + 1;
      const shifted = outline.chapters.map((item) =>
        item.sortOrder >= sortOrder ? { ...item, sortOrder: item.sortOrder + 1 } : item,
      );
      return {
        ...outline,
        chapters: [...shifted, { ...chapter, volumeId: null, sortOrder }],
      };
    }
    sortOrder = nextSortOrder(outline.chapters);
  }

  return {
    ...outline,
    chapters: [
      ...outline.chapters,
      { ...chapter, volumeId, sortOrder },
    ],
  };
}

export function removeChapter(outline: Outline, chapterId: string): Outline {
  return {
    ...outline,
    chapters: resequence(outline.chapters.filter((chapter) => chapter.id !== chapterId)),
  };
}

export function renameChapter(outline: Outline, chapterId: string, title: string): Outline {
  return {
    ...outline,
    chapters: outline.chapters.map((chapter) =>
      chapter.id === chapterId ? { ...chapter, title } : chapter,
    ),
  };
}
