import type {
  AppCredentials,
  AppPreferences,
  MessageReplyMode,
  SecretsConfig,
} from './schema';
import {
  normalizePermissions,
  permissionsToLegacySandbox,
  type AccessMode,
  type CodexSandboxMode,
  type PermissionConfig,
  type PermissionSource,
} from './permissions';

export type AgentKind = 'claude' | 'codex';
export type GroupAccessMode = 'legacy' | 'owner-only' | 'owner-present' | 'open';
export type SandboxMode = CodexSandboxMode;
export type { AccessMode, PermissionConfig, PermissionSource };

export interface ProfileAccess {
  ownerOpenId?: string;
  allowedUsers: string[];
  allowedChats: string[];
  admins: string[];
  /** When present, non-owners may run only these built-in commands. */
  memberCommands?: string[];
  requireMentionInGroup: boolean;
  groupAccessMode: GroupAccessMode;
}

type ProfileAccessInput = Partial<ProfileAccess> & {
  ownerRequiredInGroups?: boolean;
};

export interface SandboxConfig {
  default?: SandboxMode;
  max?: SandboxMode;
  defaultMode: SandboxMode;
  maxMode: SandboxMode;
}

export interface CodexConfig {
  binaryPath: string;
  realpath?: string;
  version?: string;
  sha256?: string;
  owner?: number;
  mode?: number;
  codexHome?: string;
  inheritCodexHome?: boolean;
  ignoreUserConfig?: boolean;
  ignoreRules?: boolean;
}

export interface AttachmentConfig {
  maxCount: number;
  maxBytes: number;
  maxFileBytes: number;
  imageMaxBytes: number;
  cacheTtlMs: number;
  cacheMaxBytes: number;
}

export type CommentConfig = Record<string, never>;

export type LarkCliIdentityPreset = 'bot-only' | 'user-default';

export type LarkCliUserImportStatus =
  | 'not-needed'
  | 'imported'
  | 'skipped-existing-private-user'
  | 'skipped-no-local-user'
  | 'failed';

export interface LarkCliConfig {
  identityPreset: LarkCliIdentityPreset;
  localUserImport?: {
    status: LarkCliUserImportStatus;
    attemptedAt?: string;
    importedAt?: string;
    reason?: string;
  };
}

export interface PrivateRulesConfig {
  entry?: string;
  maxBytes: number;
}

export interface ProfileConfig {
  schemaVersion: 2;
  agentKind: AgentKind;
  accounts: {
    app: AppCredentials;
  };
  secrets?: SecretsConfig;
  preferences: Omit<AppPreferences, 'access' | 'requireMentionInGroup'>;
  access: ProfileAccess;
  workspaces: {
    default?: string;
    allowedRoot?: string;
  };
  sandbox: SandboxConfig;
  permissions: PermissionConfig;
  permissionSource?: PermissionSource;
  codex?: CodexConfig;
  attachments: AttachmentConfig;
  comments: CommentConfig;
  larkCli: LarkCliConfig;
  privateRules: PrivateRulesConfig;
}

export interface RootConfig {
  schemaVersion: 2;
  activeProfile: string;
  preferences: Record<string, never>;
  secrets?: SecretsConfig;
  migrations?: {
    permissionDefaultsV1?: string[];
  };
  profiles: Record<string, ProfileConfig>;
}

export interface CreateDefaultProfileConfigInput {
  agentKind: AgentKind;
  accounts: {
    app: AppCredentials;
  };
  preferences?: AppPreferences;
  access?: ProfileAccessInput;
  sandbox?: Partial<SandboxConfig>;
  permissions?: Partial<PermissionConfig>;
  codex?: CodexConfig;
  secrets?: SecretsConfig;
}

export function createDefaultProfileConfig(
  input: CreateDefaultProfileConfigInput,
): ProfileConfig {
  return normalizeProfileConfig({
    schemaVersion: 2,
    ...input,
  });
}

export function normalizeProfileConfig(input: unknown): ProfileConfig {
  if (!input || typeof input !== 'object') {
    throw new Error('profile config must be an object');
  }
  const raw = input as {
    schemaVersion?: unknown;
    agentKind?: unknown;
    accounts?: unknown;
    secrets?: SecretsConfig;
    preferences?: (AppPreferences & { access?: ProfileAccessInput }) | undefined;
    access?: ProfileAccessInput;
    workspaces?: {
      default?: unknown;
      allowedRoot?: unknown;
      // Legacy workspace authorization fields are accepted for config
      // compatibility only; normalizeWorkspaces drops them.
      trusted?: unknown;
      trustedRoots?: unknown;
      riskFlags?: unknown;
    };
    sandbox?: Partial<SandboxConfig>;
    permissions?: Partial<PermissionConfig>;
    codex?: CodexConfig & { flags?: unknown };
    attachments?: Partial<AttachmentConfig>;
    comments?: unknown;
    larkCli?: unknown;
    privateRules?: unknown;
  };

  if (raw.schemaVersion !== 2) {
    throw new Error('profile schemaVersion must be 2');
  }
  if (raw.agentKind !== 'claude' && raw.agentKind !== 'codex') {
    throw new Error('agentKind must be claude or codex');
  }
  const accounts = normalizeAccounts(raw.accounts);
  if (raw.agentKind === 'codex' && !raw.codex) {
    throw new Error('codex profile requires codex configuration');
  }

  const preferences = normalizePreferences(raw.preferences);
  const access = normalizeAccess(
    raw.access ?? raw.preferences?.access,
    raw.preferences?.requireMentionInGroup,
  );
  const { permissions, source: permissionSource } = normalizePermissions({
    permissions: raw.permissions,
    sandbox: raw.sandbox,
  });
  const sandbox = permissionsToLegacySandbox(permissions);
  const workspaces = normalizeWorkspaces(raw.workspaces);
  const comments = normalizeComments(raw.comments);
  const larkCli = normalizeLarkCli(raw.larkCli);
  const privateRules = normalizePrivateRules(raw.privateRules);

  return {
    schemaVersion: 2,
    agentKind: raw.agentKind,
    accounts,
    ...(raw.secrets ? { secrets: raw.secrets } : {}),
    preferences,
    access,
    workspaces,
    sandbox,
    permissions,
    permissionSource,
    ...(raw.codex ? { codex: normalizeCodex(raw.codex) } : {}),
    attachments: {
      maxCount: numberOr(raw.attachments?.maxCount, 10),
      maxBytes: numberOr(raw.attachments?.maxBytes, 100 * 1024 * 1024),
      maxFileBytes: numberOr(raw.attachments?.maxFileBytes, 25 * 1024 * 1024),
      imageMaxBytes: numberOr(raw.attachments?.imageMaxBytes, 25 * 1024 * 1024),
      cacheTtlMs: numberOr(raw.attachments?.cacheTtlMs, 24 * 60 * 60 * 1000),
      cacheMaxBytes: numberOr(raw.attachments?.cacheMaxBytes, 512 * 1024 * 1024),
    },
    comments,
    larkCli,
    privateRules,
  };
}

function normalizeAccounts(input: unknown): ProfileConfig['accounts'] {
  if (!input || typeof input !== 'object') {
    throw new Error('accounts.app is required');
  }
  const accounts = input as { app?: Partial<AppCredentials> };
  const app = accounts.app;
  if (!app?.id || !app.secret || (app.tenant !== 'feishu' && app.tenant !== 'lark')) {
    throw new Error('accounts.app is incomplete');
  }
  return {
    app: {
      id: app.id,
      secret: app.secret,
      tenant: app.tenant,
    },
  };
}

function normalizePreferences(
  preferences: AppPreferences | undefined,
): ProfileConfig['preferences'] {
  const {
    access: _access,
    requireMentionInGroup: _mention,
    messageReply,
    ...rest
  } = preferences ?? {};
  if (messageReply !== undefined && isMessageReply(messageReply)) {
    return {
      ...rest,
      messageReply,
    };
  }
  return rest;
}

function isMessageReply(value: unknown): value is MessageReplyMode {
  return value === 'card' || value === 'markdown' || value === 'text';
}

function normalizeAccess(
  access: ProfileAccessInput | undefined,
  legacyRequireMentionInGroup: boolean | undefined,
): ProfileAccess {
  const ownerOpenId = typeof access?.ownerOpenId === 'string' && access.ownerOpenId.trim()
    ? access.ownerOpenId.trim()
    : undefined;
  const groupAccessMode = normalizeGroupAccessMode(
    access?.groupAccessMode,
    access?.ownerRequiredInGroups,
  );
  return {
    ...(ownerOpenId ? { ownerOpenId } : {}),
    allowedUsers: stringArray(access?.allowedUsers),
    allowedChats: stringArray(access?.allowedChats),
    admins: stringArray(access?.admins),
    ...(access?.memberCommands !== undefined
      ? { memberCommands: normalizeMemberCommands(access.memberCommands) }
      : {}),
    requireMentionInGroup: access?.requireMentionInGroup ?? legacyRequireMentionInGroup ?? true,
    groupAccessMode,
  };
}

function normalizeGroupAccessMode(
  value: unknown,
  legacyOwnerRequired: boolean | undefined,
): GroupAccessMode {
  if (
    value === 'owner-only' ||
    value === 'owner-present' ||
    value === 'legacy' ||
    value === 'open'
  ) {
    return value;
  }
  return legacyOwnerRequired === true ? 'owner-present' : 'legacy';
}

function normalizeMemberCommands(input: unknown): string[] {
  return [
    ...new Set(
      stringArray(input)
        .map((command) => command.trim().toLowerCase())
        .filter((command) => /^\/[a-z][a-z0-9-]*$/.test(command)),
    ),
  ];
}

function normalizeWorkspaces(input: {
  default?: unknown;
  allowedRoot?: unknown;
  trusted?: unknown;
  trustedRoots?: unknown;
  riskFlags?: unknown;
} | undefined): ProfileConfig['workspaces'] {
  const defaultWorkspace = typeof input?.default === 'string' && input.default.trim()
    ? input.default.trim()
    : undefined;
  const allowedRoot = typeof input?.allowedRoot === 'string' && input.allowedRoot.trim()
    ? input.allowedRoot.trim()
    : undefined;
  return {
    ...(defaultWorkspace ? { default: defaultWorkspace } : {}),
    ...(allowedRoot ? { allowedRoot } : {}),
  };
}

function normalizeCodex(input: CodexConfig & { flags?: unknown }): CodexConfig {
  const codex: CodexConfig = {
    binaryPath: input.binaryPath,
    ...(typeof input.realpath === 'string' ? { realpath: input.realpath } : {}),
    ...(typeof input.version === 'string' ? { version: input.version } : {}),
    ...(typeof input.sha256 === 'string' ? { sha256: input.sha256 } : {}),
    ...(typeof input.owner === 'number' ? { owner: input.owner } : {}),
    ...(typeof input.mode === 'number' ? { mode: input.mode } : {}),
    ...(typeof input.codexHome === 'string' ? { codexHome: input.codexHome } : {}),
    inheritCodexHome: input.inheritCodexHome !== false,
    ignoreUserConfig: input.ignoreUserConfig === true,
    ignoreRules: input.ignoreRules !== false,
  };
  return codex;
}

function normalizeComments(_input: unknown): CommentConfig {
  return {};
}

function normalizeLarkCli(input: unknown): LarkCliConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { identityPreset: 'bot-only' };
  }
  const raw = input as {
    identityPreset?: unknown;
    localUserImport?: unknown;
  };
  const identityPreset: LarkCliIdentityPreset =
    raw.identityPreset === 'user-default' ? 'user-default' : 'bot-only';
  const localUserImport = normalizeLarkCliUserImport(raw.localUserImport);
  return {
    identityPreset,
    ...(localUserImport ? { localUserImport } : {}),
  };
}

function normalizePrivateRules(input: unknown): PrivateRulesConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { maxBytes: 128 * 1024 };
  }
  const raw = input as {
    entry?: unknown;
    maxBytes?: unknown;
  };
  const entry = typeof raw.entry === 'string' && raw.entry.trim()
    ? raw.entry.trim()
    : undefined;
  const maxBytes = typeof raw.maxBytes === 'number' && Number.isFinite(raw.maxBytes)
    ? Math.max(4096, Math.min(Math.floor(raw.maxBytes), 512 * 1024))
    : 128 * 1024;
  return {
    ...(entry ? { entry } : {}),
    maxBytes,
  };
}

function normalizeLarkCliUserImport(input: unknown): LarkCliConfig['localUserImport'] | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const raw = input as {
    status?: unknown;
    attemptedAt?: unknown;
    importedAt?: unknown;
    reason?: unknown;
  };
  if (!isLarkCliUserImportStatus(raw.status)) return undefined;
  return {
    status: raw.status,
    ...(typeof raw.attemptedAt === 'string' ? { attemptedAt: raw.attemptedAt } : {}),
    ...(typeof raw.importedAt === 'string' ? { importedAt: raw.importedAt } : {}),
    ...(typeof raw.reason === 'string' ? { reason: raw.reason } : {}),
  };
}

function isLarkCliUserImportStatus(value: unknown): value is LarkCliUserImportStatus {
  return (
    value === 'not-needed' ||
    value === 'imported' ||
    value === 'skipped-existing-private-user' ||
    value === 'skipped-no-local-user' ||
    value === 'failed'
  );
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}
