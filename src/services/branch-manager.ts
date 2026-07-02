/**
 * BranchManager — git-like branching for story graph.
 * Replaces world_explorer/branch_manager.py.
 */

import { readJsonFileSync, atomicWriteJson } from "../lib/atomic-io";
import { existsSync } from "node:fs";
import { join } from "node:path";

interface BranchData {
  parent: string;
  additions: { nodes: string[]; edges: Array<{ source: string; target: string; type: string }> };
  deletions: Array<[string, string]>;
}

class Branch {
  parent: string;
  additions: { nodes: string[]; edges: Array<{ source: string; target: string; type: string }> };
  deletions: Array<[string, string]>;

  constructor(parent = "main") {
    this.parent = parent;
    this.additions = { nodes: [], edges: [] };
    this.deletions = [];
  }
}

export class BranchManager {
  private _dbPath: string;
  private _branches: Map<string, Branch> = new Map();
  private _lastSave: Promise<void> = Promise.resolve();
  active = "main";

  constructor(dbPath: string) {
    this._dbPath = dbPath;
    this._load();
  }

  private _branchesFile(): string {
    return join(this._dbPath, "branches.json");
  }

  private _load(): void {
    const file = this._branchesFile();
    if (existsSync(file)) {
      const data = readJsonFileSync<Record<string, BranchData>>(file);
      if (data) {
        for (const [name, bdata] of Object.entries(data)) {
          const branch = new Branch(bdata.parent);
          branch.additions = bdata.additions ?? { nodes: [], edges: [] };
          branch.deletions = bdata.deletions ?? [];
          this._branches.set(name, branch);
        }
        return;
      }
    }
    this._branches.set("main", new Branch());
  }

  private _save(): void {
    const ser: Record<string, BranchData> = {};
    for (const [name, branch] of this._branches) {
      ser[name] = {
        parent: branch.parent,
        additions: branch.additions,
        deletions: branch.deletions,
      };
    }
    this._lastSave = atomicWriteJson(this._branchesFile(), ser);
  }

  async flush(): Promise<void> {
    await this._lastSave;
  }

  create(name: string, fromBranch = "main"): void {
    if (this._branches.has(name)) {
      throw new Error(`Branch '${name}' already exists`);
    }
    this._branches.set(name, new Branch(fromBranch));
    this._save();
  }

  switch(name: string): void {
    if (!this._branches.has(name)) {
      throw new Error(`Branch '${name}' not found`);
    }
    this.active = name;
  }

  addNode(uid: string): void {
    const branch = this._branches.get(this.active);
    if (branch) {
      branch.additions.nodes.push(uid);
      this._save();
    }
  }

  deleteEdge(source: string, target: string): void {
    const branch = this._branches.get(this.active);
    if (branch) {
      branch.deletions.push([source, target]);
      this._save();
    }
  }

  mergeIntoMain(branchName: string): void {
    if (!this._branches.has(branchName)) {
      throw new Error("Branch not found");
    }
    this._branches.delete(branchName);
    this.active = "main";
    this._save();
  }

  listBranches(): string[] {
    return Array.from(this._branches.keys());
  }

  getBranch(name: string): BranchData | null {
    const branch = this._branches.get(name);
    if (!branch) return null;
    return {
      parent: branch.parent,
      additions: branch.additions,
      deletions: branch.deletions,
    };
  }
}
