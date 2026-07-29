import type { Permission, RoleAssignment, UUID } from "@/types/domain";

export function hasRole(roles: RoleAssignment[], role: RoleAssignment["role"], teamId?: UUID) {
  return roles.some((assignment) => {
    if (assignment.role !== role) {
      return false;
    }
    return teamId ? assignment.teamId === teamId : true;
  });
}

export function can(roles: RoleAssignment[], permission: Permission, teamId?: UUID): boolean {
  if (hasRole(roles, "super_admin")) {
    return true;
  }

  switch (permission) {
    case "view_admin_tab":
      return roles.length > 0;
    case "manage_own_team_players":
      return Boolean(teamId && hasRole(roles, "team_admin", teamId));
    case "publish_result":
      return hasRole(roles, "moderator");
    case "manage_any_players":
    case "manage_schedule":
    case "replace_result":
    case "manage_teams":
    case "view_audit_log":
      return false;
  }
}

export function visiblePermissions(roles: RoleAssignment[], teamId?: UUID): Record<Permission, boolean> {
  return {
    view_admin_tab: can(roles, "view_admin_tab", teamId),
    manage_own_team_players: can(roles, "manage_own_team_players", teamId),
    manage_any_players: can(roles, "manage_any_players", teamId),
    manage_schedule: can(roles, "manage_schedule", teamId),
    publish_result: can(roles, "publish_result", teamId),
    replace_result: can(roles, "replace_result", teamId),
    manage_teams: can(roles, "manage_teams", teamId),
    view_audit_log: can(roles, "view_audit_log", teamId)
  };
}
