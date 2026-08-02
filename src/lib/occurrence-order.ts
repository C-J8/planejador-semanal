export function insertAtSafeIndex(
  ids: string[],
  id: string,
  requestedIndex: number,
): string[] {
  const withoutId = ids.filter((currentId) => currentId !== id);
  const index = Math.min(Math.max(requestedIndex, 0), withoutId.length);
  return [...withoutId.slice(0, index), id, ...withoutId.slice(index)];
}

export function normalizedPositions(
  ids: string[],
): Array<{ id: string; position: number }> {
  return ids.map((id, position) => ({ id, position }));
}
