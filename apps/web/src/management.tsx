import { FormSelect } from "./form-select";
import { useEffect, useState, type FormEvent } from "react";
import { Button, TextField, Panel } from "@stardrop/ui";
export async function request(path: string, body?: unknown, method?: string) {
  const r = await fetch("/api/v1" + path, {
    method: method ?? (body ? "POST" : "GET"),
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const b: any = await r.json();
  if (!r.ok) throw new Error(b.error?.code ?? "service_unavailable");
  return b;
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
export function EditUser({ user, run }: { user: any; run: Run }) {
  return (
    <Panel title="Profil ve hesap">
      <form
        key={user.id}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(async () => {
            await request(
              "/admin/users/" + user.id,
              {
                firstName: f.get("firstName"),
                lastName: f.get("lastName"),
                email: f.get("email"),
                disabled: f.has("disabled"),
                currentPassword: f.get("currentPassword"),
              },
              "PUT",
            );
          });
        }}
      >
        <TextField
          name="firstName"
          label="İsim"
          defaultValue={user.first_name}
          required
        />
        <TextField
          name="lastName"
          label="Soyisim"
          defaultValue={user.last_name}
          required
        />
        <TextField
          name="email"
          label="E-posta"
          type="email"
          defaultValue={user.email}
          required
        />
        <label>
          <input
            name="disabled"
            type="checkbox"
            defaultChecked={!!user.disabled}
          />{" "}
          Hesabı kapat
        </label>
        <TextField
          name="currentPassword"
          label="Senin şifren"
          type="password"
          required
        />
        <Button type="submit">Değişiklikleri kaydet</Button>
      </form>
    </Panel>
  );
}
export function Fields({ run, userId }: { run: Run; userId?: string }) {
  const [fields, setFields] = useState<any[]>([]);
  const [values, setValues] = useState<any[]>([]);
  const reloadValues = () =>
    userId
      ? request("/admin/profile-values/" + userId).then(setValues)
      : Promise.resolve();
  useEffect(() => {
    reloadValues().catch(() => {});
  }, [userId]);
  const reload = () => request("/admin/profile-fields").then(setFields);
  useEffect(() => {
    reload().catch(() => {});
  }, []);
  return (
    <Panel title={userId ? "Ek profil bilgileri" : "Profil alanları"}>
      {userId ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(async () => {
              const field = fields.find((x) => x.key === f.get("key"));
              const raw = String(f.get("value"));
              const value =
                field.type === "number"
                  ? Number(raw)
                  : field.type === "boolean"
                    ? raw === "true"
                    : raw;
              await request(
                "/admin/profile-values/" + userId,
                { key: field.key, value },
                "PUT",
              );
              await reloadValues();
            });
          }}
        >
          {values.map((v) => (
            <p key={v.field_key}>
              {fields.find((f) => f.key === v.field_key)?.label ?? v.field_key}:{" "}
              {String(JSON.parse(v.value))}
            </p>
          ))}
          <label>
            Alan
            <FormSelect name="key">
              {fields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label} ({f.type})
                </option>
              ))}
            </FormSelect>
          </label>
          <TextField name="value" label="Değer" required />
          <Button type="submit">Kaydet</Button>
        </form>
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
export function Sessions({ run }: { run: Run }) {
  const [sessions, setSessions] = useState<any[]>([]);
  useEffect(() => {
    request("/sessions")
      .then(setSessions)
      .catch(() => {});
  }, []);
  return (
    <>
      <h1>Oturumlar</h1>
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
    </>
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
              <TextField
                name="currentPassword"
                label="Senin şifren"
                type="password"
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

export function AppsList({ run }: { run: Run }) {
  const [apps, setApps] = useState<any[]>([]);
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
              src={a.logo_url}
              alt=""
              referrerPolicy="no-referrer"
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
          <span className="app-list-name">
            {a.name}
            <small>
              {a.id} · {a.disabled ? "Kapalı" : "Açık"}
            </small>
          </span>
          <details className="app-branding-editor">
            <summary>Markayı düzenle</summary>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                run(async () => {
                  await request(
                    "/admin/apps/" + a.id,
                    {
                      name: form.get("name"),
                      logoUrl: form.get("logoUrl"),
                    },
                    "PUT",
                  );
                  setApps(await request("/admin/apps"));
                });
              }}
            >
              <TextField
                name="name"
                label="Uygulama adı"
                defaultValue={a.name}
                maxLength={80}
                required
              />
              <TextField
                name="logoUrl"
                label="Logo adresi (HTTPS)"
                hint="Logo, kayıtlı uygulama adresinde barınmalı. Boşsa Starbase simgesi görünür."
                defaultValue={a.logo_url ?? ""}
                maxLength={2048}
              />
              <Button type="submit">Markayı kaydet</Button>
            </form>
          </details>
          <Button
            onClick={() =>
              run(async () => {
                await request(
                  "/admin/apps/" + a.id,
                  { disabled: !a.disabled },
                  "PUT",
                );
                setApps(await request("/admin/apps"));
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
