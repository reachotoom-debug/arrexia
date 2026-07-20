import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  loadAuthenticatedUserUncached,
  loadWorkspaceAccessUncached,
  loadWorkspaceAccessUncachedForSession,
  type AuthLoaderDeps,
} from "../requestScope";

type MockAuthUser = { id: string; email?: string | null };

type MockState = {
  authUser: MockAuthUser | null;
  authError: unknown;
  getUserCalls: number;
  memberships: Array<{ workspace_id: string; user_id: string; role: string | null }>;
  workspaces: Array<{ id: string; name: string; organization_id: string | null }>;
};

function createMockSupabase(state: MockState) {
  return {
    auth: {
      getUser: async () => {
        state.getUserCalls += 1;
        return {
          data: { user: state.authUser },
          error: state.authError,
        };
      },
    },
    from(table: string) {
      if (table === "workspace_members") {
        return {
          select: () => ({
            eq: (column: string, value: string) => ({
              eq: (_column2: string, userId: string) => ({
                maybeSingle: async () => {
                  const row = state.memberships.find(
                    (membership) =>
                      membership.workspace_id === value && membership.user_id === userId
                  );
                  return { data: row ?? null, error: null };
                },
              }),
            }),
          }),
        };
      }

      if (table === "workspaces") {
        return {
          select: () => ({
            eq: (_column: string, workspaceId: string) => ({
              single: async () => {
                const row = state.workspaces.find((workspace) => workspace.id === workspaceId);
                if (!row) {
                  return { data: null, error: { message: "not found" } };
                }
                return { data: row, error: null };
              },
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

function createDeps(state: MockState): AuthLoaderDeps {
  return {
    getSupabase: async () => createMockSupabase(state) as unknown as Awaited<ReturnType<AuthLoaderDeps["getSupabase"]>>,
  };
}

describe("loadAuthenticatedUserUncached", () => {
  it("returns null when Supabase auth has no user", async () => {
    const state: MockState = {
      authUser: null,
      authError: null,
      getUserCalls: 0,
      memberships: [],
      workspaces: [],
    };

    const user = await loadAuthenticatedUserUncached(createDeps(state));
    assert.equal(user, null);
    assert.equal(state.getUserCalls, 1);
  });
});

describe("loadWorkspaceAccessUncached", () => {
  it("Test 3 — rejects unauthorized workspace membership", async () => {
    const user = { id: "user-1", email: "user@example.com" };
    const state: MockState = {
      authUser: user,
      authError: null,
      getUserCalls: 0,
      memberships: [],
      workspaces: [
        {
          id: "ws-allowed",
          name: "Allowed",
          organization_id: "org-1",
        },
      ],
    };

    const access = await loadWorkspaceAccessUncached("ws-allowed", user, createDeps(state));
    assert.equal(access.status, "forbidden");
  });

  it("Test 2 — resolves independently per workspaceId", async () => {
    const user = { id: "user-1", email: "user@example.com" };
    const state: MockState = {
      authUser: user,
      authError: null,
      getUserCalls: 0,
      memberships: [
        { workspace_id: "ws-a", user_id: "user-1", role: "owner" },
        { workspace_id: "ws-b", user_id: "user-1", role: "owner" },
      ],
      workspaces: [
        { id: "ws-a", name: "Workspace A", organization_id: "org-a" },
        { id: "ws-b", name: "Workspace B", organization_id: "org-b" },
      ],
    };

    const deps = createDeps(state);
    const [accessA, accessB] = await Promise.all([
      loadWorkspaceAccessUncached("ws-a", user, deps),
      loadWorkspaceAccessUncached("ws-b", user, deps),
    ]);

    assert.equal(accessA.status, "ok");
    assert.equal(accessB.status, "ok");
    if (accessA.status === "ok" && accessB.status === "ok") {
      assert.equal(accessA.workspace.id, "ws-a");
      assert.equal(accessB.workspace.id, "ws-b");
      assert.notEqual(accessA.workspace.organization_id, accessB.workspace.organization_id);
    }
  });
});

describe("loadWorkspaceAccessUncachedForSession", () => {
  it("Test 4 — uncached loaders remain per-call (no persistent module cache)", async () => {
    const state: MockState = {
      authUser: { id: "user-1", email: "user@example.com" },
      authError: null,
      getUserCalls: 0,
      memberships: [{ workspace_id: "ws-a", user_id: "user-1", role: "owner" }],
      workspaces: [{ id: "ws-a", name: "Workspace A", organization_id: "org-a" }],
    };

    const deps = createDeps(state);
    await loadWorkspaceAccessUncachedForSession("ws-a", deps);
    await loadWorkspaceAccessUncachedForSession("ws-a", deps);
    assert.equal(state.getUserCalls, 2);
  });
});

describe("React cache() integration", () => {
  it("Test 1 — documents request-scoped dedupe is enforced in lib/auth/server.ts via React cache()", () => {
    const serverSource = readFileSync(path.join(process.cwd(), "lib", "auth", "server.ts"), "utf8");
    assert.match(serverSource, /export const getAuthenticatedUser = cache\(loadAuthenticatedUserUncached\)/);
    assert.match(serverSource, /const getWorkspaceAccess = cache\(/);
  });
});

describe("WorkspaceShell navigation prefetch", () => {
  it("Test 5 — canonical workspace nav links no longer disable prefetch", () => {
    const shellPath = path.join(
      process.cwd(),
      "app",
      "[workspaceId]",
      "_components",
      "WorkspaceShell.tsx"
    );
    const source = readFileSync(shellPath, "utf8");

    const navBlock = source.slice(
      source.indexOf("items.map((item)"),
      source.indexOf("{showAdminLink ? (")
    );

    assert.doesNotMatch(navBlock, /prefetch=\{false\}/);
    assert.match(source, /href="\/logout"[\s\S]*prefetch=\{false\}/);
  });
});
