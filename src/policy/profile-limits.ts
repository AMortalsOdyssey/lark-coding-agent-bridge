import type { ProfileConfig } from '../config/profile-schema';
import type { AccessDecision } from './access';

/**
 * Owners bypass profile run limits by default for backward compatibility.
 * A profile can opt into applying the same workspace and permission ceilings
 * to owner runs without changing owner-only chat or administration privileges.
 */
export function profileRunLimitsApply(
  profile: Pick<ProfileConfig, 'permissions'>,
  access: AccessDecision,
): boolean {
  return access.reason !== 'owner' || profile.permissions.ownerAccess === 'profile';
}

export function allowedRootForAccess(
  profile: Pick<ProfileConfig, 'permissions' | 'workspaces'>,
  access: AccessDecision,
): string | undefined {
  return profileRunLimitsApply(profile, access) ? profile.workspaces.allowedRoot : undefined;
}
