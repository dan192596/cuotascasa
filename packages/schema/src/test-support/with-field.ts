type Node = Record<string | number, unknown>;

function parentOf(root: unknown, path: readonly (string | number)[]): Node {
  return path.slice(0, -1).reduce<Node>((node, key) => node[key] as Node, root as Node);
}

/** Returns a deep copy of `value` with the property at the non-empty `path` replaced (test helper). */
export function withField(value: unknown, path: readonly (string | number)[], replacement: unknown): unknown {
  const copy: unknown = structuredClone(value);
  parentOf(copy, path)[path[path.length - 1] as string | number] = replacement;
  return copy;
}

/** Returns a deep copy of `value` without the property at the non-empty `path` (test helper). */
export function withoutField(value: unknown, path: readonly (string | number)[]): unknown {
  const copy: unknown = structuredClone(value);
  delete parentOf(copy, path)[path[path.length - 1] as string | number];
  return copy;
}
