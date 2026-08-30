export function matchesNameQuery(name: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return true;
  }
  return name.toLowerCase().includes(needle);
}

export function matchesCharacterQuery(
  character: { name: string; aliases: readonly string[] },
  query: string,
): boolean {
  if (matchesNameQuery(character.name, query)) {
    return true;
  }
  return character.aliases.some((alias) => matchesNameQuery(alias, query));
}
