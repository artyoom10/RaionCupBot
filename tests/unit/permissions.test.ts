import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions/rules";
import type { RoleAssignment } from "@/types/domain";

describe("permissions", () => {
  it("does not allow a regular user to use admin actions", () => {
    const roles: RoleAssignment[] = [];

    expect(can(roles, "view_admin_tab")).toBe(false);
    expect(can(roles, "manage_schedule")).toBe(false);
    expect(can(roles, "publish_result")).toBe(false);
  });

  it("allows moderator to manage schedule and results only", () => {
    const roles: RoleAssignment[] = [{ role: "moderator", teamId: null }];

    expect(can(roles, "view_admin_tab")).toBe(true);
    expect(can(roles, "manage_schedule")).toBe(true);
    expect(can(roles, "publish_result")).toBe(true);
    expect(can(roles, "replace_result")).toBe(true);
    expect(can(roles, "manage_any_players")).toBe(false);
    expect(can(roles, "manage_teams")).toBe(false);
    expect(can(roles, "view_audit_log")).toBe(false);
  });

  it("allows super admin to do every checked action", () => {
    const roles: RoleAssignment[] = [{ role: "super_admin", teamId: null }];

    expect(can(roles, "manage_schedule")).toBe(true);
    expect(can(roles, "view_audit_log")).toBe(true);
    expect(can(roles, "replace_result")).toBe(true);
  });
});
