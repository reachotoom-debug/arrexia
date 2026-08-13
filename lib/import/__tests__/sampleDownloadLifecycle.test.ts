import assert from "node:assert/strict";
import { describe, it, mock, beforeEach, afterEach } from "node:test";

import {
  BROWSER_DOWNLOAD_REVOKE_DELAY_MS,
  downloadSampleFile,
  runSampleDownloadTask,
  triggerBrowserFileDownload,
} from "@/app/[workspaceId]/settings/import/_lib/sampleFiles";

type MockWindow = {
  setTimeout: typeof globalThis.setTimeout;
};

describe("import sample download lifecycle", () => {
  let appendedLinks: HTMLAnchorElement[];
  let revokedUrls: string[];
  let createdUrls: string[];
  let timeoutCallbacks: Array<{ fn: () => void; delay: number }>;
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;
  let originalWindow: MockWindow | undefined;
  let originalDocument: Document | undefined;
  let mockWindow: MockWindow;
  let mockDocument: Document;

  beforeEach(() => {
    appendedLinks = [];
    revokedUrls = [];
    createdUrls = [];
    timeoutCallbacks = [];

    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    originalWindow = globalThis.window as MockWindow | undefined;
    originalDocument = globalThis.document;

    URL.createObjectURL = () => {
      const url = `blob:mock-${createdUrls.length + 1}`;
      createdUrls.push(url);
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      revokedUrls.push(url);
    };

    mockWindow = {
      setTimeout: ((fn: () => void, delay?: number) => {
        timeoutCallbacks.push({ fn, delay: delay ?? 0 });
        return 1 as unknown as ReturnType<typeof setTimeout>;
      }) as typeof globalThis.setTimeout,
    };

    mockDocument = {
      createElement: ((tagName: string) => {
        if (tagName !== "a") {
          throw new Error(`Unexpected element: ${tagName}`);
        }
        const link = {
          href: "",
          download: "",
          rel: "",
          style: { display: "" },
          click: mock.fn(),
          remove: mock.fn(),
        } as unknown as HTMLAnchorElement;
        appendedLinks.push(link);
        return link;
      }) as typeof document.createElement,
      body: {
        appendChild: ((node: Node) => node) as typeof document.body.appendChild,
      },
    } as unknown as Document;

    globalThis.window = mockWindow as unknown as Window & typeof globalThis;
    globalThis.document = mockDocument;
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      globalThis.window = originalWindow as unknown as Window & typeof globalThis;
    }
    if (originalDocument === undefined) {
      Reflect.deleteProperty(globalThis, "document");
    } else {
      globalThis.document = originalDocument;
    }
  });

  it("F — triggerBrowserFileDownload does not navigate", () => {
    triggerBrowserFileDownload("Name\tEmail\nA\ta@example.com", "clients_sample.tsv", "text/tab-separated-values");
    assert.equal(appendedLinks.length, 1);
    assert.match(appendedLinks[0]?.href ?? "", /^blob:mock-/);
    assert.equal(appendedLinks[0]?.download, "clients_sample.tsv");
  });

  it("H — object URL cleanup is deferred, not immediate", () => {
    triggerBrowserFileDownload("sample", "clients_sample.csv", "text/csv");
    assert.equal(revokedUrls.length, 0);
    assert.equal(timeoutCallbacks.length, 1);
    assert.equal(timeoutCallbacks[0]?.delay, BROWSER_DOWNLOAD_REVOKE_DELAY_MS);
    timeoutCallbacks[0]?.fn();
    assert.deepEqual(revokedUrls, createdUrls);
  });

  it("G — downloadSampleFile resolves synchronously after click", async () => {
    let settled = false;
    await runSampleDownloadTask(
      () => {
        downloadSampleFile("Name,Email\nA,a@example.com", "clients_sample.csv", "text/csv");
      },
      {
        onEnd: () => {
          settled = true;
        },
      }
    );
    assert.equal(settled, true);
    assert.equal(appendedLinks.length, 1);
  });

  it("A/B — client sample download task clears loading in finally", async () => {
    const lifecycle: string[] = [];
    await runSampleDownloadTask(
      () => {
        lifecycle.push("download");
        downloadSampleFile("Name\tEmail", "clients_sample.tsv", "text/tab-separated-values");
      },
      {
        onStart: () => lifecycle.push("start"),
        onEnd: () => lifecycle.push("end"),
      }
    );
    assert.deepEqual(lifecycle, ["start", "download", "end"]);
  });

  it("C — invoice-style async sample download clears loading in finally", async () => {
    const lifecycle: string[] = [];
    await runSampleDownloadTask(
      async () => {
        lifecycle.push("await");
        await Promise.resolve();
        downloadSampleFile("invoice", "invoices_sample.tsv", "text/tab-separated-values");
      },
      {
        onStart: () => lifecycle.push("start"),
        onEnd: () => lifecycle.push("end"),
      }
    );
    assert.deepEqual(lifecycle, ["start", "await", "end"]);
  });

  it("D — payment sample download clears loading in finally", async () => {
    let downloading = false;
    await runSampleDownloadTask(
      () => {
        downloadSampleFile("payment", "payments_sample.csv", "text/csv");
      },
      {
        onStart: () => {
          downloading = true;
        },
        onEnd: () => {
          downloading = false;
        },
      }
    );
    assert.equal(downloading, false);
  });

  it("E — failure clears loading state in finally", async () => {
    let downloading = false;
    let caught: unknown;
    await runSampleDownloadTask(
      async () => {
        throw new Error("sample generation failed");
      },
      {
        onStart: () => {
          downloading = true;
        },
        onEnd: () => {
          downloading = false;
        },
        onError: (error) => {
          caught = error;
        },
      }
    ).catch(() => undefined);
    assert.equal(downloading, false);
    assert.match(String(caught), /sample generation failed/);
  });
});
