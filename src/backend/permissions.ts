declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

const granted = new Set<string>();

export async function initPermissions(): Promise<void> {
  try {
    const list = await spindle.permissions.getGranted();
    for (const p of list) granted.add(p);
    spindle.log.info(`Permissions initialized: ${[...granted].join(", ") || "none"}`);
  } catch (err) {
    spindle.log.warn(`Failed to load permissions: ${err instanceof Error ? err.message : err}`);
  }
  spindle.permissions.onChanged((detail) => {
    granted.clear();
    for (const p of detail.allGranted) granted.add(p);
    spindle.log.info(`Permissions updated: ${detail.allGranted.join(", ") || "none"}`);
  });
  spindle.permissions.onDenied((detail) => {
    spindle.log.warn(`Permission denied: ${detail.permission} for ${detail.operation}`);
  });
}

export function hasPermission(p: string): boolean {
  return granted.has(p);
}
