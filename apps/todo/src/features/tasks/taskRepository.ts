import type { NewTask, Task, TaskUpdate } from "./task";

export interface TaskRepository {
  list(userId: string): Promise<Task[]>;
  create(userId: string, input: NewTask): Promise<Task>;
  update(userId: string, taskId: string, patch: TaskUpdate): Promise<Task>;
  remove(userId: string, taskId: string): Promise<void>;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function isTask(value: unknown): value is Task {
  if (!value || typeof value !== "object") return false;
  const task = value as Partial<Task>;
  return (
    typeof task.id === "string" &&
    typeof task.title === "string" &&
    typeof task.completed === "boolean" &&
    typeof task.createdAt === "number" &&
    typeof task.updatedAt === "number"
  );
}

export class LocalTaskRepository implements TaskRepository {
  private readonly storage: KeyValueStore;

  constructor(storage: KeyValueStore) {
    this.storage = storage;
  }

  private key(userId: string) {
    return `starbase-todo.v1.${encodeURIComponent(userId)}`;
  }

  async list(userId: string) {
    const raw = this.storage.getItem(this.key(userId));
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isTask) : [];
    } catch {
      return [];
    }
  }

  async create(userId: string, input: NewTask) {
    const now = Date.now();
    const task: Task = {
      id: crypto.randomUUID(),
      title: input.title.trim(),
      completed: false,
      createdAt: now,
      updatedAt: now,
    };
    const tasks = await this.list(userId);
    this.save(userId, [task, ...tasks]);
    return task;
  }

  async update(userId: string, taskId: string, patch: TaskUpdate) {
    const tasks = await this.list(userId);
    const current = tasks.find((task) => task.id === taskId);
    if (!current) throw new Error("task_not_found");
    const updated = { ...current, ...patch, updatedAt: Date.now() };
    this.save(
      userId,
      tasks.map((task) => (task.id === taskId ? updated : task)),
    );
    return updated;
  }

  async remove(userId: string, taskId: string) {
    const tasks = await this.list(userId);
    this.save(
      userId,
      tasks.filter((task) => task.id !== taskId),
    );
  }

  private save(userId: string, tasks: Task[]) {
    this.storage.setItem(this.key(userId), JSON.stringify(tasks));
  }
}

export const taskRepository: TaskRepository = new LocalTaskRepository(
  localStorage,
);
