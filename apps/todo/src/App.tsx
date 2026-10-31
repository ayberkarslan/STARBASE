import { useEffect, useState, type FormEvent } from "react";
import { StarbaseError, type Profile } from "@starbase/sdk";
import { useStarbaseAuth } from "@starbase/sdk/react";
import {
  ArrowDownRight,
  ArrowRight,
  Check,
  Circle,
  Command,
  LogOut,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button, IconButton } from "@stardrop/ui";
import { taskRepository } from "./features/tasks/taskRepository";
import type { Task } from "./features/tasks/task";
import "./App.css";

type View = "inbox" | "completed";
function greetingName(user: Profile) {
  return user.firstName || user.username;
}

function App() {
  const { snapshot, login, logout: signOut } = useStarbaseAuth();
  const user = snapshot.status === "authenticated" ? snapshot.profile : null;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<View>("inbox");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user) {
      setTasks([]);
      return () => {
        active = false;
      };
    }
    void taskRepository
      .list(user.id)
      .then((stored) => {
        if (active) setTasks(stored);
      })
      .catch(() => setError("Görevler bu cihazdan okunamadı."));
    return () => {
      active = false;
    };
  }, [user?.id]);

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !title.trim()) return;
    setBusy(true);
    setError("");
    try {
      const task = await taskRepository.create(user.id, { title });
      setTasks((current) => [task, ...current]);
      setTitle("");
    } catch {
      setError("Görev kaydedilemedi. Tekrar deneyebilir misin?");
    } finally {
      setBusy(false);
    }
  }

  async function toggleTask(task: Task) {
    if (!user) return;
    try {
      const updated = await taskRepository.update(user.id, task.id, {
        completed: !task.completed,
      });
      setTasks((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch {
      setError("Görev güncellenemedi.");
    }
  }

  async function deleteTask(task: Task) {
    if (!user) return;
    try {
      await taskRepository.remove(user.id, task.id);
      setTasks((current) => current.filter((item) => item.id !== task.id));
    } catch {
      setError("Görev silinemedi.");
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await signOut();
    } catch {
      setError("Çıkış Starbase’e bildirilemedi. Tekrar deneyebilirsin.");
    } finally {
      setTasks([]);
      setBusy(false);
    }
  }

  const completedCount = tasks.filter((task) => task.completed).length;
  const openCount = tasks.length - completedCount;
  const visibleTasks = tasks.filter((task) =>
    view === "completed" ? task.completed : !task.completed,
  );

  if (snapshot.status === "checking") {
    return (
      <main className="todo-gate sd-theme" aria-live="polite">
        <OrbitMark />
        <span className="gate-caption">STARBASE OTURUMU KONTROL EDİLİYOR</span>
      </main>
    );
  }

  if (snapshot.status !== "authenticated" || !user) {
    return (
      <main className="todo-gate sd-theme">
        <div className="gate-stars" aria-hidden="true" />
        <section className="gate-panel">
          <OrbitMark large />
          <p className="eyebrow">YILDIZ ROKET TAKIMI · GÖREV MERKEZİ</p>
          <h1>Fikrini yörüngeye al.</h1>
          <p className="gate-copy">
            Tek Starbase hesabınla devam et. Giriş ve kayıt Starbase hesap
            merkezinde güvenli şekilde yapılır.
          </p>
          {error && (
            <p className="todo-error" role="alert">
              {error}
            </p>
          )}
          {snapshot.status === "anonymous" &&
            snapshot.error &&
            !(
              snapshot.error instanceof StarbaseError &&
              snapshot.error.code === "authentication_required"
            ) && (
              <p className="todo-error" role="alert">
                Starbase bağlantısı tamamlanamadı. Yeniden deneyebilirsin.
              </p>
            )}
          <Button
            variant="primary"
            className="gate-submit"
            onClick={() => void login()}
          >
            Starbase ile devam et <ArrowRight size={16} />
          </Button>
          <span className="gate-note">Şifren bu uygulamayla paylaşılmaz.</span>
        </section>
        <footer className="gate-footer">
          STARBASE · TEK HESAP, TÜM YÖRÜNGELER
        </footer>
      </main>
    );
  }

  return (
    <div className="todo-app sd-theme">
      <div className="app-starfield" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <header className="todo-header">
        <a className="todo-brand" href="/" aria-label="Yörünge ana ekran">
          <img src="/brand/yrt.png" alt="" />
          <span>YÖRÜNGE</span>
        </a>
        <div className="header-center">
          <span /> KİŞİSEL GÖREV PANOSU
        </div>
        <div className="header-user">
          <span className="user-mark">
            {greetingName(user).slice(0, 1).toUpperCase()}
          </span>
          <span className="user-name">{greetingName(user)}</span>
          <IconButton
            label="Starbase’ten çıkış yap"
            variant="bare"
            disabled={busy}
            onClick={() => void logout()}
          >
            <LogOut size={16} />
          </IconButton>
        </div>
      </header>

      <div className="todo-layout">
        <aside className="todo-sidebar">
          <p className="eyebrow sidebar-label">ÇALIŞMA ALANI</p>
          <nav className="task-nav" aria-label="Görev görünümleri">
            <button
              type="button"
              className={view === "inbox" ? "selected" : ""}
              aria-current={view === "inbox" ? "page" : undefined}
              onClick={() => setView("inbox")}
            >
              <Command size={17} />
              <span>Gelen kutusu</span>
              <b>{openCount}</b>
            </button>
            <button
              type="button"
              className={view === "completed" ? "selected" : ""}
              aria-current={view === "completed" ? "page" : undefined}
              onClick={() => setView("completed")}
            >
              <Check size={17} />
              <span>Tamamlananlar</span>
              <b>{completedCount}</b>
            </button>
          </nav>
          <div className="sidebar-bottom">
            <div className="orbit-status">
              <span /> STARBASE’E BAĞLI
            </div>
            <p>Görevlerin bu cihazda, hesabına özel saklanır.</p>
          </div>
        </aside>

        <main className="task-main">
          <div className="task-heading">
            <div>
              <p className="eyebrow">
                MERHABA, {greetingName(user).toLocaleUpperCase("tr-TR")}
              </p>
              <h1>
                {view === "inbox" ? "Bir sonraki adım." : "İz bıraktıkların."}
              </h1>
              <p className="heading-subtitle">
                {view === "inbox"
                  ? "Aklındaki işi yaz, gerisini sıraya koy."
                  : "Tamamladığın görevler burada."}
              </p>
            </div>
            <div
              className="task-progress"
              aria-label={`${completedCount} görev tamamlandı`}
            >
              <span className="progress-ring">
                <Sparkles size={18} />
              </span>
              <span>
                <strong>{completedCount}</strong>
                <small> TAMAMLANDI</small>
              </span>
            </div>
          </div>

          {view === "inbox" && (
            <form className="task-entry" onSubmit={addTask}>
              <Plus size={19} aria-hidden="true" />
              <input
                aria-label="Yeni görev"
                autoComplete="off"
                maxLength={180}
                placeholder="Yeni bir görev ekle…"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <span className="entry-hint">ENTER</span>
              <Button
                variant="primary"
                type="submit"
                disabled={busy || !title.trim()}
                aria-label="Görev ekle"
              >
                Ekle <ArrowDownRight size={15} />
              </Button>
            </form>
          )}

          {error && (
            <p className="todo-error" role="alert">
              {error}
            </p>
          )}
          <div className="list-header">
            <span>
              {view === "inbox" ? "SIRADAKİLER" : "TAMAMLANAN GÖREVLER"}
            </span>
            <span>{visibleTasks.length.toString().padStart(2, "0")} GÖREV</span>
          </div>
          {visibleTasks.length ? (
            <ul className="task-list">
              {visibleTasks.map((task, index) => (
                <li
                  className={
                    task.completed ? "task-row is-complete" : "task-row"
                  }
                  key={task.id}
                >
                  <button
                    type="button"
                    className="task-check"
                    aria-label={
                      task.completed
                        ? `${task.title} görevini yeniden aç`
                        : `${task.title} görevini tamamla`
                    }
                    aria-pressed={task.completed}
                    onClick={() => void toggleTask(task)}
                  >
                    {task.completed ? (
                      <Check size={14} />
                    ) : (
                      <Circle size={18} />
                    )}
                  </button>
                  <span className="task-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="task-copy">
                    <span className="task-title">{task.title}</span>
                    <time dateTime={new Date(task.createdAt).toISOString()}>
                      {new Intl.DateTimeFormat("tr-TR", {
                        day: "numeric",
                        month: "short",
                      }).format(task.createdAt)}
                    </time>
                  </div>
                  <IconButton
                    label={`${task.title} görevini sil`}
                    variant="bare"
                    className="task-delete"
                    onClick={() => void deleteTask(task)}
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-tasks">
              <OrbitMark />
              <p>
                {view === "inbox"
                  ? "Şimdilik her şey sakin."
                  : "Henüz tamamlanan görev yok."}
              </p>
              <span>
                {view === "inbox"
                  ? "Yeni bir görev ekleyerek yörüngeyi başlat."
                  : "Bir görevi bitirdiğinde burada göreceksin."}
              </span>
            </div>
          )}
          <footer className="task-footer">
            <span>{tasks.length} TOPLAM GÖREV</span>
            <span>
              YÖRÜNGENİ KENDİN BELİRLE <i />
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}

function OrbitMark({ large = false }: { large?: boolean }) {
  return (
    <span
      className={large ? "orbit-mark orbit-mark-large" : "orbit-mark"}
      aria-hidden="true"
    >
      <img src="/brand/yrt.png" alt="" />
    </span>
  );
}

export default App;
