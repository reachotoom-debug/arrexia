import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { readFileSync } from "node:fs";
import { getToastDuration } from "../../components/ui/toast-duration";
import { ConfirmationDialog, createConfirmationSubmission } from "../../components/ui/confirmation-dialog";

test("toast defaults and explicit overrides use only Radix timing", () => {
  for (const variant of [undefined, "default", "success"]) assert.equal(getToastDuration(variant), 4000);
  assert.equal(getToastDuration("destructive"), Infinity);
  assert.equal(getToastDuration("success", 7000), 7000);
  assert.equal(getToastDuration("destructive", 9000), 9000);
  assert.equal(getToastDuration("default", Infinity), Infinity);
  const source = readFileSync("components/ui/toaster.tsx", "utf8");
  assert.match(source, /duration=\{getToastDuration\(props.variant, props.duration\)\}/);
  assert.match(source, /<ToastClose/);
  assert.doesNotMatch(source, /setTimeout/);
});

test("confirmation submission blocks overlapping requests and unlocks after failures", async () => {
  const submit = createConfirmationSubmission();
  let calls = 0;
  let release!: () => void;
  const first = submit(() => { calls++; return new Promise<void>(resolve => { release = resolve; }); });
  await submit(async () => { calls++; });
  assert.equal(calls, 1);
  release();
  await first;
  await assert.rejects(submit(async () => { throw new Error("failure"); }), /failure/);
  await submit(async () => { calls++; });
  assert.equal(calls, 2);
});

test("confirmation renders accessible labels; cancellation never submits", async (t) => {
  t.mock.method(React, "useRef", (value: unknown) => ({ current: value }));
  t.mock.method(React, "useState", (value: unknown) => [value, () => {}]);
  t.mock.method(React, "useId", () => "fixture-id");
  t.mock.method(React, "useEffect", () => {});
  let submissions = 0;
  const openChanges: boolean[] = [];
  const tree = ConfirmationDialog({ open: true, action: "unarchive", recordName: "invoice", count: 2,
    onOpenChange: value => openChanges.push(value), onConfirm: async () => { submissions++; } });
  assert.equal(tree.type, "dialog");
  assert.ok(tree.props["aria-labelledby"]);
  assert.ok(tree.props["aria-describedby"]);
  assert.match(tree.props.className, /w-\[calc\(100%-2rem\)\]/);
  assert.match(tree.props.className, /max-w-\[28rem\]/);
  const content = React.Children.toArray(tree.props.children).find(React.isValidElement) as typeof tree;
  assert.equal(content.type, "div");
  assert.match(content.props.className, /w-full/);
  assert.doesNotMatch(content.props.className, /\bmx-/);
  assert.match(content.props.children[2].props.className, /flex-wrap/);
  const buttons = content.props.children[2].props.children;
  assert.equal(buttons[0].props.children, "Cancel");
  assert.equal(buttons[1].props.children, "Unarchive");
  buttons[0].props.onClick();
  assert.deepEqual(openChanges, [false]);
  assert.equal(submissions, 0);
  await buttons[1].props.onClick();
  assert.equal(submissions, 1);
  const archiveTree = ConfirmationDialog({ open: true, action: "archive", recordName: "client", count: 1,
    onOpenChange: () => {}, onConfirm: async () => {} });
  const archiveContent = React.Children.toArray(archiveTree.props.children).find(React.isValidElement) as typeof content;
  assert.equal(archiveContent.props.children[2].props.children[1].props.variant, "destructive");
  t.mock.method(React, "useState", () => [true, () => {}]);
  const pendingTree = ConfirmationDialog({ open: true, action: "unarchive", recordName: "invoice", count: 2,
    onOpenChange: value => openChanges.push(value), onConfirm: async () => { submissions++; } });
  const pendingContent = React.Children.toArray(pendingTree.props.children).find(React.isValidElement) as typeof content;
  const pendingButtons = pendingContent.props.children[2].props.children;
  assert.equal(pendingButtons[0].props.disabled, true);
  assert.equal(pendingButtons[1].props.disabled, true);
  pendingTree.props.onCancel({ preventDefault() {} });
  assert.deepEqual(openChanges, [false]);
});

test("invoice unarchive opens the dialog before executing the unchanged server action", () => {
  const source = readFileSync("app/[workspaceId]/invoices/_components/InvoicesTableUnarchiveButton.tsx", "utf8");
  assert.doesNotMatch(source, /window.confirm/);
  assert.match(source, /onClick=\{\(\) => setShowConfirm\(true\)\}/);
  assert.match(source, /onConfirm=\{handleUnarchive\}/);
  assert.match(source, /bulkUnarchiveInvoices\(workspaceId, Array.from\(selectedIds\)\)/);
});
