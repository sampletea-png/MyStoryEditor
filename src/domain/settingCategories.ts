export const UNCATEGORIZED_ID = "uncategorized";
export const UNCATEGORIZED_NAME = "未分类";

export const PRESET_CATEGORY_NAMES = ["势力", "制度", "物种", "规则"] as const;

export type SettingCategory = {
  id: string;
  name: string;
  sortOrder: number;
  system: boolean;
};

export function presetCategories(): SettingCategory[] {
  return [
    { id: UNCATEGORIZED_ID, name: UNCATEGORIZED_NAME, sortOrder: 0, system: true },
    ...PRESET_CATEGORY_NAMES.map((name, index) => ({
      id: `preset-${name}`,
      name,
      sortOrder: index + 1,
      system: false,
    })),
  ];
}

export function canDeleteCategory(category: SettingCategory): boolean {
  return !category.system && category.id !== UNCATEGORIZED_ID;
}

export function canRenameCategory(category: SettingCategory): boolean {
  return canDeleteCategory(category);
}

export function categoryNameTaken(
  categories: readonly SettingCategory[],
  name: string,
  exceptId?: string,
): boolean {
  const trimmed = name.trim();
  return categories.some(
    (category) => category.id !== exceptId && category.name.trim() === trimmed,
  );
}

export function reassignEntriesOnCategoryDelete<T extends { categoryId: string }>(
  entries: readonly T[],
  deletedCategoryId: string,
): T[] {
  return entries.map((entry) =>
    entry.categoryId === deletedCategoryId
      ? { ...entry, categoryId: UNCATEGORIZED_ID }
      : entry,
  );
}
