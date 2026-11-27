export const VALID_WORKSPACES = ['piloting', 'gereja', 'testing'];

export function normalizeWorkspace(value) {
  if (value === 'gereja') return 'gereja';
  if (value === 'testing') return 'testing';
  return 'piloting';
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
  if (ws === 'testing') {
    return { workspace: 'testing' };
  }
  return {
    $or: [
      { workspace: 'piloting' },
      { workspace: { $exists: false } },
      { workspace: null },
    ],
  };
}
