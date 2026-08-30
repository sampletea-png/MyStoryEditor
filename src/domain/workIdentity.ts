export type WorkManifest = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type DiscoveredPackage = {
  path: string;
  manifest: WorkManifest;
};

export function assignUniqueIdentities(
  packages: DiscoveredPackage[],
  createId: () => string,
): { packages: DiscoveredPackage[]; rewrittenPaths: string[] } {
  const seen = new Map<string, string>();
  const rewrittenPaths: string[] = [];
  const next = packages.map((item) => {
    const existingPath = seen.get(item.manifest.id);
    if (!existingPath) {
      seen.set(item.manifest.id, item.path);
      return item;
    }
    const id = createId();
    rewrittenPaths.push(item.path);
    return {
      ...item,
      manifest: { ...item.manifest, id },
    };
  });
  return { packages: next, rewrittenPaths };
}
