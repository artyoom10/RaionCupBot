import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions/rules";
import type { RoleAssignment } from "@/types/domain";

const teamA = "00000000-0000-0000-0000-000000000001";
const teamB = "00000000-0000-0000-0000-000000000002";

describe("permissions", () => {
  it("allows a team admin to manage only own team players", () => {
    const roles: RoleAssignment[] = [{ role: "team_admin", teamId: teamA }];

    expect(can(roles, "manage_own_team_players", teamA)).toBe(true);
    expect(can(roles, "manage_own_team_players", teamB)).toBe(false);
    expect(can(roles, "publish_result")).toBe(false);
  });

  it("allows moderator to publish but not replace results", () => {
    const roles: RoleAssignment[] = [{ role: "moderator", teamId: null }];

    expect(can(roles, "publish_result")).toBe(true);
    expect(can(roles, "replace_result")).toBe(false);
  });

  it("allows super admin to do every checked action", () => {
    const roles: RoleAssignment[] = [{ role: "super_admin", teamId: null }];

    expect(can(roles, "manage_schedule")).toBe(true);
    expect(can(roles, "view_audit_log")).toBe(true);
    expect(can(roles, "replace_result")).toBe(true);
  });
});
