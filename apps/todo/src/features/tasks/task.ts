export type Task = {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
  updatedAt: number;
};

export type NewTask = Pick<Task, "title">;
export type TaskUpdate = Partial<Pick<Task, "title" | "completed">>;
