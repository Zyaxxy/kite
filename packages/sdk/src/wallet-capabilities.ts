/** Only versions advertised by the signing method Kite actually invokes. */
export function advertisedSigningVersions(
  versions: readonly unknown[] | undefined,
  canSign: boolean,
): number[] {
  if (!canSign || !Array.isArray(versions)) return [];
  return [0, 1].filter((version) =>
    versions.some((value) => value === version || value === String(version)),
  );
}
