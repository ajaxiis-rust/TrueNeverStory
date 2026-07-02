import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { BranchManager } from "./branch-manager";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";

const TEST_DIR = join(tmpdir(), "hibring-test-branch");

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("BranchManager", () => {
  it("creates with main branch", () => {
    const bm = new BranchManager(TEST_DIR);
    expect(bm.active).toBe("main");
    expect(bm.listBranches()).toEqual(["main"]);
  });

  it("create branch", async () => {
    const bm = new BranchManager(TEST_DIR);
    bm.create("feature1");
    await bm.flush();
    expect(bm.listBranches()).toContain("feature1");
    expect(bm.getBranch("feature1")?.parent).toBe("main");
  });

  it("create throws on duplicate", () => {
    const bm = new BranchManager(TEST_DIR);
    bm.create("feature1");
    expect(() => bm.create("feature1")).toThrow("already exists");
  });

  it("switch branch", () => {
    const bm = new BranchManager(TEST_DIR);
    bm.create("feature1");
    bm.switch("feature1");
    expect(bm.active).toBe("feature1");
  });

  it("switch throws on unknown", () => {
    const bm = new BranchManager(TEST_DIR);
    expect(() => bm.switch("unknown")).toThrow("not found");
  });

  it("addNode records to active branch", async () => {
    const bm = new BranchManager(TEST_DIR);
    bm.create("feature1");
    bm.switch("feature1");
    bm.addNode("char:aragorn");
    await bm.flush();
    const branch = bm.getBranch("feature1");
    expect(branch?.additions.nodes).toContain("char:aragorn");
  });

  it("deleteEdge records deletion", async () => {
    const bm = new BranchManager(TEST_DIR);
    bm.create("feature1");
    bm.switch("feature1");
    bm.deleteEdge("a", "b");
    await bm.flush();
    const branch = bm.getBranch("feature1");
    expect(branch?.deletions).toContainEqual(["a", "b"]);
  });

  it("mergeIntoMain removes branch", async () => {
    const bm = new BranchManager(TEST_DIR);
    bm.create("feature1");
    bm.mergeIntoMain("feature1");
    await bm.flush();
    expect(bm.listBranches()).not.toContain("feature1");
    expect(bm.active).toBe("main");
  });

  it("mergeIntoMain throws on unknown", () => {
    const bm = new BranchManager(TEST_DIR);
    expect(() => bm.mergeIntoMain("unknown")).toThrow("not found");
  });

  it("getBranch returns null for unknown", () => {
    const bm = new BranchManager(TEST_DIR);
    expect(bm.getBranch("unknown")).toBeNull();
  });

  it("persists to disk", async () => {
    const bm = new BranchManager(TEST_DIR);
    bm.create("persist-feature");
    bm.switch("persist-feature");
    bm.addNode("node123");
    await bm.flush();

    const bm2 = new BranchManager(TEST_DIR);
    expect(bm2.listBranches()).toContain("persist-feature");
    expect(bm2.getBranch("persist-feature")?.additions.nodes).toContain("node123");
  });

  it("create from non-main branch", async () => {
    const bm = new BranchManager(TEST_DIR);
    bm.create("feature1");
    bm.create("feature2", "feature1");
    await bm.flush();
    expect(bm.getBranch("feature2")?.parent).toBe("feature1");
  });
});
