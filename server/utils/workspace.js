export const VALID_WORKSPACES = ['piloting', 'gereja'];

export function normalizeWorkspace(value) {
  return value === 'gereja' ? 'gereja' : 'piloting';
}

/**
 * Return a MongoDB filter matching records for a given workspace.
 * Legacy documents without a `workspace` field belong to 'piloting' by default.
 */
export function workspaceQueryFilter(workspace) {
  const ws = normalizeWorkspace(workspace);
  if (ws === 'gereja') {
    return { workspace: 'gereja' };
  }
  return {
    $or: [
      { workspace: 'piloting' },
      { workspace: { $exists: false } },
      { workspace: null },
    ],
  };
}
