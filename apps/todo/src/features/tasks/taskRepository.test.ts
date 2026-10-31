import { describe, expect, it } from "vitest";
import { LocalTaskRepository, type KeyValueStore } from "./taskRepository";

class MemoryStore implements KeyValueStore {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe("LocalTaskRepository", () => {
  it("keeps tasks scoped to each account and supports the task lifecycle", async () => {
    const repository = new LocalTaskRepository(new MemoryStore());
    const task = await repository.create("user-a", {
      title: "  Check orbit  ",
    });

    expect(task.title).toBe("Check orbit");
    expect(await repository.list("user-b")).toEqual([]);
    expect(await repository.list("user-a")).toEqual([task]);

    const completed = await repository.update("user-a", task.id, {
      completed: true,
    });
    expect(completed.completed).toBe(true);
    expect(completed.updatedAt).toBeGreaterThanOrEqual(task.updatedAt);

    await repository.remove("user-a", task.id);
    expect(await repository.list("user-a")).toEqual([]);
  });

  it("ignores invalid persisted data", async () => {
    const store = new MemoryStore();
    store.setItem("starbase-todo.v1.user-a", "not-json");
    const repository = new LocalTaskRepository(store);

    expect(await repository.list("user-a")).toEqual([]);
  });
});
