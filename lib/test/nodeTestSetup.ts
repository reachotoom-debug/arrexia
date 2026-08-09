import Module from "node:module";

type ModuleLoadFn = (
  request: string,
  parent: NodeModule | null | undefined,
  isMain: boolean
) => unknown;

const moduleRuntime = Module as typeof Module & { _load: ModuleLoadFn };
const originalLoad = moduleRuntime._load;

moduleRuntime._load = function load(request, parent, isMain) {
  if (request === "server-only") {
    return {};
  }
  return originalLoad(request, parent, isMain);
};

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
