import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadPrivateRuleInstructions } from '../../../src/agent/private-rules';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('private rules loader', () => {
  it('loads an entry file and explicit bridge include files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bridge-private-rules-'));
    roots.push(root);
    const rulesDir = join(root, 'rules');
    await mkdir(rulesDir, { recursive: true });
    const entry = join(rulesDir, 'ENTRY.md');
    await writeFile(entry, '# Entry\n\n<!-- bridge-include: project.md -->\n', 'utf8');
    await writeFile(join(rulesDir, 'project.md'), '# Project\n\nOnly this project.\n', 'utf8');

    const instructions = await loadPrivateRuleInstructions({
      entry,
      maxBytes: 64 * 1024,
    });

    expect(instructions).toHaveLength(1);
    expect(instructions[0]).toContain('# Entry');
    expect(instructions[0]).toContain('# Project');
    expect(instructions[0]).toContain('Only this project.');
    expect(instructions[0]).not.toContain(entry);
  });
});
