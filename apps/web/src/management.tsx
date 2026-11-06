import { FormSelect } from "./form-select";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, IconButton, TextField, Panel, SelectMenu } from "@stardrop/ui";
import { Check, Pencil, X } from "lucide-react";
import { invalidateDirectory } from "./member-live";
import { memberStatus, memberStatusOptions, type MemberStatus } from "./member-status";
import { PasswordField } from "./password-field";
export async function request(path: string, body?: unknown, method?: string) {
  const r = await fetch("/api/v1" + path, {
    method: method ?? (body ? "POST" : "GET"),
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const b: any = await r.json();
  if (!r.ok) throw new Error(b.error?.code ?? "service_unavailable");
  if ((method ?? (body ? "POST" : "GET")) !== "GET" && /^\/admin\/(users\/|memberships|profile-values\/)/.test(path)) invalidateDirectory();
  return b;
}
async function uploadApplicationLogo(appId: string, file: File) {
  const response = await fetch(`/api/v1/admin/apps/${appId}/logo`, {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
  const result: any = await response.json();
  if (!response.ok)
    throw new Error(result.error?.code ?? "logo_upload_failed");
  return result;
}
type Run = (fn: () => Promise<void>) => Promise<void>;
export function Invitations({ run }: { run: Run }) {
  const [url, setUrl] = useState("");
  return (
    <Panel title="Takıma davet et">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(async () => {
            setUrl(
              (await request("/admin/invites", { email: f.get("email") })).url,
            );
          });
        }}
      >
        <TextField name="email" label="E-posta" type="email" required />
        <Button type="submit">Davet bağlantısı oluştur</Button>
        {url && (
          <TextField label="Kişiye ileteceğin bağlantı" value={url} readOnly />
        )}
      </form>
    </Panel>
  );
}
export function EditUser({ user, onUpdated }: { user: any; onUpdated: (updated: any) => void }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<MemberStatus>(() => memberStatus(user));
  useEffect(() => setStatus(memberStatus(user)), [user.id, user.disabled, user.verified]);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const save = async (path: string, data: unknown, method: string, success: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      await request(path, data, method);
      onUpdated(await request("/admin/users/" + user.id));
      setFeedback({ text: success, error: false });
      return true;
    } catch (cause) {
      const code = (cause as Error).message;
      setFeedback({ text: code === "reauthentication_required" ? "Güvenlik değişikliği için şifreni gir. Doğrulama 10 dakika geçerli." : "Kaydedilemedi: " + code, error: true });
      return false;
    } finally { setBusy(false); }
  };
  return <Panel title="Üye bilgileri" description="Kimlik ve erişim ayrı ayrı düzenlenir." className="member-edit-card">
    <form key={`${user.id}:${user.first_name}:${user.last_name}`} className="member-edit-form" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      void save("/admin/users/" + user.id + "/profile", { firstName: String(form.get("firstName")), lastName: String(form.get("lastName")) }, "PATCH", "İsim bilgileri kaydedildi.");
    }}>
      <div className="member-edit-grid">
        <TextField name="firstName" label="İsim" defaultValue={user.first_name} required maxLength={80} />
        <TextField name="lastName" label="Soyisim" defaultValue={user.last_name} required maxLength={80} />
      </div>
      <Button type="submit" disabled={busy}>İsmi kaydet</Button>
    </form>
    <form className="member-edit-form member-status-form" onSubmit={(event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      void save("/admin/users/" + user.id + "/status", {
        status,
        currentPassword: String(data.get("currentPassword") || ""),
      }, "PATCH", "Hesap durumu güncellendi.").then((ok) => { if (ok) form.reset(); });
    }}>
      <SelectMenu label="Hesap durumu" value={status} options={memberStatusOptions} onChange={(value) => setStatus(value as MemberStatus)} />
      <p>Aktif hesabın e-postası onaylanır. Beklemede onay ister; yasaklı hesap giriş yapamaz. Değişiklik mevcut oturumları kapatır.</p>
      <PasswordField name="currentPassword" label="Senin şifren" autoComplete="current-password" hint="İlk güvenlik değişikliğinde gir; 10 dakika boyunca tekrar gerekmez." />
      <Button type="submit" disabled={busy || status === memberStatus(user) || (user.owner && status !== "active")}>Durumu güncelle</Button>
    </form>
    <details className="member-security">
      <summary>E-posta adresi <span>Gerekirse değiştir</span></summary>
      <form key={`${user.id}:${user.email}:${user.disabled}`} className="member-edit-form" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void save("/admin/users/" + user.id, {
          firstName: user.first_name, lastName: user.last_name,
          email: String(form.get("email")), disabled: Boolean(user.disabled),
          currentPassword: String(form.get("currentPassword") || ""),
        }, "PUT", "Hesap erişimi güncellendi.");
      }}>
        <TextField name="email" label="E-posta" type="email" defaultValue={user.email} required />
        <PasswordField name="currentPassword" label="Senin şifren" autoComplete="current-password" hint="İlk güvenlik değişikliğinde gir; 10 dakika boyunca tekrar gerekmez." />
        <Button type="submit" disabled={busy}>Erişimi güncelle</Button>
      </form>
    </details>
    {feedback && <p className={feedback.error ? "member-form-feedback is-error" : "member-form-feedback"} role={feedback.error ? "alert" : "status"}>{feedback.text}</p>}
  </Panel>;
}
export function Fields({ run, userId, revision = 0 }: { run: Run; userId?: string; revision?: number }) {
  const [fields, setFields] = useState<any[]>([]);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const dirty = useRef(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const reloadValues = () =>
    userId
      ? request("/admin/profile-values/" + userId).then((rows: any[]) => setDraft(Object.fromEntries(rows.map((row) => [row.field_key, JSON.parse(row.value)]))))
      : Promise.resolve();
  useEffect(() => {
    dirty.current = false;
    setDraft({});
    setFeedback(null);
    reloadValues().catch(() => {});
  }, [userId]);
  useEffect(() => {
    if (revision && !dirty.current) reloadValues().catch(() => {});
  }, [revision]);
  const reload = () => request("/admin/profile-fields").then(setFields);
  useEffect(() => {
    reload().catch(() => {});
  }, []);
  return (
    <Panel title={userId ? "Ek profil bilgileri" : "Profil alanları"} className={userId ? "member-fields-card" : undefined}>
      {userId ? (
        fields.length ? <form className="member-fields-form" onSubmit={(event) => {
          event.preventDefault();
          const values = fields.map((field) => {
            const raw = draft[field.key];
            const value = field.type === "boolean" ? Boolean(raw)
              : raw === undefined || raw === "" ? null
              : field.type === "number" ? Number(raw) : raw;
            return { key: field.key, value };
          });
          setSaving(true);
          setFeedback(null);
          void request("/admin/profile-values/" + userId + "/batch", { values }, "PUT")
            .then(async () => { dirty.current = false; await reloadValues(); setFeedback({ text: "Profil bilgileri kaydedildi.", error: false }); })
            .catch((cause) => setFeedback({ text: "Kaydedilemedi: " + (cause as Error).message, error: true }))
            .finally(() => setSaving(false));
        }}>
          <div className="member-fields-grid">{fields.map((field) => {
            const value = draft[field.key];
            const setValue = (next: unknown) => { dirty.current = true; setDraft((current) => ({ ...current, [field.key]: next })); };
            if (field.type === "boolean") return <label className="member-access-toggle" key={field.key}><input type="checkbox" checked={Boolean(value)} onChange={(event) => setValue(event.target.checked)} /><span>{field.label}</span></label>;
            if (field.type === "select") return <SelectMenu key={field.key} label={field.label} value={String(value ?? "")} options={[{ value: "", label: "Seç" }, ...JSON.parse(field.options).map((item: string) => ({ value: item, label: item }))]} onChange={setValue} />;
            return <TextField key={field.key} label={field.label} type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} value={value ?? ""} onChange={(event) => setValue(event.target.value)} />;
          })}</div>
          <Button type="submit" disabled={saving}>Profil bilgilerini kaydet</Button>
          {feedback && <p className={feedback.error ? "member-form-feedback is-error" : "member-form-feedback"} role={feedback.error ? "alert" : "status"}>{feedback.text}</p>}
        </form> : <p className="member-fields-empty">Henüz ek profil alanı tanımlanmamış.</p>
      ) : (
        <>
          <div>
            {fields.map((f) => (
              <p key={f.key}>
                {f.label} · {f.type} · {f.key}
              </p>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(async () => {
                await request("/admin/profile-fields", {
                  key: f.get("key"),
                  label: f.get("label"),
                  type: f.get("type"),
                  options: String(f.get("options")).split(",").filter(Boolean),
                });
                await reload();
              });
            }}
          >
            <TextField name="key" label="Alan anahtarı" required />
            <TextField name="label" label="Görünen ad" required />
            <label>
              Tip
              <FormSelect name="type">
                {["text", "number", "date", "boolean", "select"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </FormSelect>
            </label>
            <TextField name="options" label="Seçenekler (virgülle)" />
            <Button type="submit">Alan oluştur</Button>
          </form>
        </>
      )}
    </Panel>
  );
}
export function Sessions({ run, compact = false }: { run: Run; compact?: boolean }) {
  const [sessions, setSessions] = useState<any[]>([]);
  useEffect(() => {
    request("/sessions")
      .then(setSessions)
      .catch(() => {});
  }, []);
  return (
    <section className={compact ? "account-sessions" : ""}>
      {!compact && <h1>Oturumlar</h1>}
      {sessions.map((s) => (
        <Panel key={s.family} title={s.app_id ?? "STARBASE hesap merkezi"}>
          <p>
            Son geçerlilik: {new Date(s.expires * 1000).toLocaleString("tr")}
          </p>
          <Button
            onClick={() =>
              run(async () => {
                await request("/sessions/" + s.family, undefined, "DELETE");
                setSessions(await request("/sessions"));
              })
            }
          >
            Oturumu kapat
          </Button>
        </Panel>
      ))}
      <Button
        onClick={() =>
          run(async () => {
            await request("/auth/logout-all", {});
            location.assign("/");
          })
        }
      >
        Tüm oturumları kapat
      </Button>
    </section>
  );
}
export function RolesList({ run }: { run: Run }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    request("/admin/roles")
      .then(setData)
      .catch(() => {});
  }, []);
  return (
    data && (
      <Panel title="Tanımlı roller">
        {data.roles.map((r: any) => (
          <details key={r.id}>
            <summary>
              {r.name} · {r.id}
            </summary>
            <p>
              {data.grants
                .filter((g: any) => g.role_id === r.id)
                .map((g: any) => g.permission_id)
                .join(", ") || "İzin yok"}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(async () => {
                  await request(
                    "/admin/roles/" + r.id,
                    {
                      name: f.get("name"),
                      permissions: String(f.get("permissions"))
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                      currentPassword: f.get("currentPassword"),
                    },
                    "PUT",
                  );
                  setData(await request("/admin/roles"));
                });
              }}
            >
              <TextField name="name" label="Rol adı" defaultValue={r.name} />
              <TextField
                name="permissions"
                label="İzinler (virgülle)"
                defaultValue={data.grants
                  .filter((g: any) => g.role_id === r.id)
                  .map((g: any) => g.permission_id)
                  .join(",")}
              />
              <PasswordField
                name="currentPassword"
                label="Senin şifren"
                required
              />
              <Button type="submit">Güncelle</Button>
            </form>
          </details>
        ))}
      </Panel>
    )
  );
}

export function AppsList({ run, onChanged }: { run: Run; onChanged: () => Promise<void> }) {
  const [apps, setApps] = useState<any[]>([]);
  const [uploadingApp, setUploadingApp] = useState<string | null>(null);
  const [editingApp, setEditingApp] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const refreshApps = async () => {
    setApps(await request("/admin/apps"));
    await onChanged();
  };
  useEffect(() => {
    request("/admin/apps")
      .then(setApps)
      .catch(() => {});
  }, []);
  return (
    <Panel title="Kayıtlı uygulamalar">
      {apps.map((a) => (
        <div className="app-list-row" key={a.id}>
          {a.logo_url ? (
            <img
              className="app-list-logo"
              src={`/api/v1/apps/${a.id}/logo`}
              alt=""
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
            />
          ) : (
            <span
              className="app-list-logo app-list-logo-empty"
              aria-hidden="true"
            />
          )}
          <div className="app-list-name">
            {editingApp === a.id ? (
              <form className="app-name-editor" onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  const name = draftName.trim();
                  if (!name || name === a.name) { setEditingApp(null); return; }
                  await request(`/admin/apps/${a.id}`, { name }, "PUT");
                  await refreshApps();
                  setEditingApp(null);
                });
              }}>
                <TextField aria-label={`${a.name} için yeni ad`} value={draftName} maxLength={80} required onChange={(event) => setDraftName(event.target.value)} autoFocus />
                <IconButton label="Adı kaydet" type="submit" variant="bare"><Check size={15} /></IconButton>
                <IconButton label="Vazgeç" variant="bare" onClick={() => setEditingApp(null)}><X size={15} /></IconButton>
              </form>
            ) : <span>{a.name}</span>}
            <small>
              {a.id} · {a.disabled ? "Kapalı" : "Açık"}
            </small>
          </div>
          {editingApp !== a.id && <IconButton label={`${a.name} adını düzenle`} variant="bare" onClick={() => { setEditingApp(a.id); setDraftName(a.name); }}><Pencil size={15} /></IconButton>}
          <label className="app-logo-picker">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label={`${a.name} logosu seç`}
              disabled={uploadingApp === a.id}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (!file) return;
                if (file.size > 1048576) {
                  run(async () => {
                    throw new Error("Logo dosyası 1 MB sınırını aşamaz.");
                  });
                  return;
                }
                setUploadingApp(a.id);
                run(async () => {
                  await uploadApplicationLogo(a.id, file);
                  await refreshApps();
                }).finally(() => setUploadingApp(null));
              }}
            />
            <span>{uploadingApp === a.id ? "Yükleniyor" : "Logo seç"}</span>
          </label>
          {a.logo_url && (
            <IconButton
              label={`${a.name} logosunu kaldır`}
              variant="bare"
              disabled={uploadingApp === a.id}
              onClick={() =>
                run(async () => {
                  await request(`/admin/apps/${a.id}/logo`, undefined, "DELETE");
                  await refreshApps();
                })
              }
            >
              <X size={15} />
            </IconButton>
          )}
          <Button
            onClick={() =>
              run(async () => {
                await request(
                  "/admin/apps/" + a.id,
                  { disabled: !a.disabled },
                  "PUT",
                );
                await refreshApps();
              })
            }
          >
            {a.disabled ? "Etkinleştir" : "Erişimi kapat"}
          </Button>
        </div>
      ))}
    </Panel>
  );
}
export function EditOrganization({
  kind,
  item,
  run,
}: {
  kind: "departments" | "teams";
  item: any;
  run: Run;
}) {
  return (
    <details>
      <summary>Düzenle</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(async () => {
            await request(
              "/admin/" + kind + "/" + item.id,
              { name: f.get("name"), archived: f.has("archived") },
              "PUT",
            );
            location.reload();
          });
        }}
      >
        <TextField name="name" label="Ad" defaultValue={item.name} required />
        <label>
          <input type="checkbox" name="archived" /> Arşivle
        </label>
        <Button type="submit">Kaydet</Button>
      </form>
    </details>
  );
}
