export type TileRenderingEnvironment = {
  coarsePointer: boolean;
  saveData: boolean;
  effectiveType?: string;
  deviceMemory?: number;
};

/** Keep enough neighboring tiles for continuity without permanently caching a six-tile halo. */
export function resolveMapTileKeepBuffer(environment: TileRenderingEnvironment): number {
  if (
    environment.saveData ||
    environment.effectiveType === 'slow-2g' ||
    environment.effectiveType === '2g'
  ) {
    return 2;
  }
  if (environment.coarsePointer || (environment.deviceMemory ?? 8) <= 4) return 3;
  return 4;
}

export function shouldPrefetchMapTiles(environment: TileRenderingEnvironment): boolean {
  return !(
    environment.saveData ||
    environment.effectiveType === 'slow-2g' ||
    environment.effectiveType === '2g' ||
    (environment.deviceMemory ?? 8) <= 2
  );
}

