import { isAbsolute, relative, resolve } from 'node:path';

export function isPathWithinRoot(candidate: string, root: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
