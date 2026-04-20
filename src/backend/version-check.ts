export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] => {
    const core = v.split(/[-+]/)[0];
    return core.split(".").map((part) => {
      const n = parseInt(part, 10);
      return Number.isFinite(n) ? n : 0;
    });
  };
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }
  return 0;
}

export interface HostVersionCheckResult {
  needsUpdate: boolean;
  hostVersion: string | null;
  minimum: string;
  message: string;
}

export function checkHostVersion(
  hostVersion: string | null,
  minimum: string
): HostVersionCheckResult {
  if (!hostVersion) {
    return {
      needsUpdate: false,
      hostVersion: null,
      minimum,
      message: `Lumiverse version could not be determined, skipping minimum-version check (required minimum ${minimum})`,
    };
  }
  const cmp = compareVersions(hostVersion, minimum);
  if (cmp >= 0) {
    return {
      needsUpdate: false,
      hostVersion,
      minimum,
      message: `Lumiverse ${hostVersion} satisfies Hone's minimum of ${minimum}`,
    };
  }
  return {
    needsUpdate: true,
    hostVersion,
    minimum,
    message: `Hone requires Lumiverse ${minimum} or newer, but this host is running ${hostVersion}. Some features may fail or behave unexpectedly. Update Lumiverse for the intended experience.`,
  };
}
