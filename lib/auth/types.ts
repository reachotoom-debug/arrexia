export type AuthUserInfo = {
  id: string;
  email: string | null;
};

export type WorkspaceInfo = {
  id: string;
  name: string;
  organization_id: string;
};

export type MembershipInfo = {
  workspace_id: string;
  role: string | null;
};

export type WorkspaceAccessResult =
  | {
      status: "ok";
      user: AuthUserInfo;
      workspace: WorkspaceInfo;
      membership: MembershipInfo;
    }
  | { status: "unauthenticated" }
  | { status: "forbidden" };
