import type { AgentKind } from '../config/profile-schema';
import type { ClaudeEffortLevel } from '../config/schema';

/** Sentinel meaning "let Claude Code choose its default effort". */
export const DEFAULT_EFFORT = 'default';

export interface EffortOption {
  value: typeof DEFAULT_EFFORT | ClaudeEffortLevel;
  label: string;
}

const CLAUDE_EFFORTS: EffortOption[] = [
  { value: DEFAULT_EFFORT, label: '跟随默认（不指定）' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra High' },
  { value: 'max', label: 'Max' },
];

export function supportedEfforts(): EffortOption[] {
  return CLAUDE_EFFORTS;
}

export function normalizeEffortSelection(value: string | undefined): EffortOption['value'] {
  if (!value || value === DEFAULT_EFFORT) return DEFAULT_EFFORT;
  return CLAUDE_EFFORTS.some((option) => option.value === value)
    ? (value as ClaudeEffortLevel)
    : DEFAULT_EFFORT;
}

export function resolveEffortArg(
  agentKind: AgentKind,
  value: string | undefined,
): ClaudeEffortLevel | undefined {
  if (agentKind !== 'claude') return undefined;
  const normalized = normalizeEffortSelection(value);
  return normalized === DEFAULT_EFFORT ? undefined : normalized;
}

export function effortLabel(value: string | undefined): string {
  const normalized = normalizeEffortSelection(value);
  return CLAUDE_EFFORTS.find((option) => option.value === normalized)?.label ?? normalized;
}
