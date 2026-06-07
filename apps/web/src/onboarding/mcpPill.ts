// Pure show/hide rules for the floating MCP-install pill, split out from the
// component so they're unit-testable (the `.tsx` can't be imported by the
// node:test runner). `connected` is undefined until the status query resolves —
// keep the pill hidden until then so it never flashes for an already-connected
// user.
export function shouldShowMcpPill({
  projectId,
  connected,
  dismissed,
}: {
  projectId: string | undefined;
  connected: boolean | undefined;
  dismissed: boolean;
}): boolean {
  if (!projectId) return false;
  if (connected === undefined) return false;
  if (connected) return false;
  if (dismissed) return false;
  return true;
}

// Once a user closes the pill we remember it so we don't nag on every reload.
// Keyed globally — connecting the MCP on any project hides the pill anyway.
export const MCP_PILL_DISMISS_KEY = "superlog.mcpPill.dismissed";

export function isMcpPillDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MCP_PILL_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberMcpPillDismiss(): void {
  try {
    window.localStorage.setItem(MCP_PILL_DISMISS_KEY, "1");
  } catch {
    // Private mode / blocked storage: just skip persistence.
  }
}
