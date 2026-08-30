const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/g;

export function folderNameFromWorkName(name: string): string {
  const trimmed = name.trim().replace(ILLEGAL, "").replace(/[. ]+$/g, "");
  return trimmed.length > 0 ? trimmed : "未命名作品";
}

export function uniqueFolderName(
  desired: string,
  existingLowercase: ReadonlySet<string>,
): string {
  const base = folderNameFromWorkName(desired);
  if (!existingLowercase.has(base.toLowerCase())) {
    return base;
  }
  let n = 2;
  while (existingLowercase.has(`${base}-${n}`.toLowerCase())) {
    n += 1;
  }
  return `${base}-${n}`;
}
