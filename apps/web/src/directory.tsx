import { useEffect, useState } from "react";
import {
  Button,
  Panel,
  EmptyState,
  SearchField,
  SelectMenu,
  TabBar,
  Drawer,
} from "@stardrop/ui";
import {
  ArrowUpRight,
  ArrowLeft,
  Users,
  Layers,
  AppWindow,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import type {
  DirectoryPage,
  DirectoryTeams,
  DirectoryProfile,
  ApplicationHistory,
} from "../../../packages/contracts/src";
import { request } from "./management";
import "./directory.css";
const displayTime = (value: number | null) =>
  value
    ? new Date(value * 1000).toLocaleString("tr-TR", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
const endLabels = {
  logout: "Çıkış yapıldı",
  revoked: "Oturum sonlandırıldı",
  expired: "Süresi doldu",
};
export function ApplicationHistoryView({
  data,
  onPage,
  busy = false,
}: {
  data: ApplicationHistory;
  onPage: (page: number) => void;
  busy?: boolean;
}) {
  return (
    <section className="profile-activity">
      <h3>
        <AppWindow size={17} /> Uygulama geçmişi
      </h3>
      {data.applications.length ? (
        <>
          <div className="usage-list">
            {data.applications.map((a) => (
              <Panel key={a.applicationId} title={a.applicationName}>
                <dl>
                  <dt>Son giriş</dt>
                  <dd>{displayTime(a.lastSignInAt)}</dd>
                  <dt>Son çıkış</dt>
                  <dd>
                    {a.lastSignOutAt
                      ? displayTime(a.lastSignOutAt)
                      : "Çıkış kaydı yok"}
                  </dd>
                  {a.lastEndReason && a.lastEndReason !== "logout" && (
                    <>
                      <dt>Son oturum bitişi</dt>
                      <dd>
                        {displayTime(a.lastEndAt)} ·{" "}
                        {endLabels[a.lastEndReason]}
                      </dd>
                    </>
                  )}
                </dl>
              </Panel>
            ))}
          </div>
          <h4>Son oturumlar</h4>
          {!data.visits.length && (
            <p>Son 90 günde ayrıntılı oturum kaydı bulunmuyor.</p>
          )}
          <div className="visit-list">
            {data.visits.map((v) => (
              <div key={v.id} className="visit-row">
                <div>
                  <span>{v.applicationName}</span>
                  <small>
                    {v.endReason
                      ? endLabels[v.endReason]
                      : "Çıkış bildirilmedi"}
                  </small>
                </div>
                <div>
                  <time>{displayTime(v.signedInAt)}</time>
                  <small>{v.endedAt ? displayTime(v.endedAt) : "—"}</small>
                </div>
              </div>
            ))}
          </div>
          <div className="directory-pagination">
            <Button
              size="sm"
              disabled={busy || data.page === 1}
              onClick={() => onPage(data.page - 1)}
            >
              <ArrowLeft size={14} /> Önceki
            </Button>
            <span>Sayfa {data.page}</span>
            <Button
              size="sm"
              disabled={busy || !data.hasMore}
              onClick={() => onPage(data.page + 1)}
            >
              Sonraki <ChevronRight size={14} />
            </Button>
          </div>
        </>
      ) : (
        <EmptyState
          title="Henüz uygulama girişi yok"
          description="STARBASE ile bağlanan uygulamaların giriş ve çıkış kayıtları burada görünecek."
        />
      )}
    </section>
  );
}
function MemberProfile({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<DirectoryProfile | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setProfile(null);
    setError("");
    if (!id) return;
    setBusy(true);
    request("/directory/users/" + encodeURIComponent(id))
      .then((p) => {
        if (live) setProfile(p);
      })
      .catch(() => {
        if (live)
          setError("Profil yüklenemedi veya bu üye artık dizinde bulunmuyor.");
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [id, attempt]);
  async function page(page: number) {
    setBusy(true);
    try {
      const data = await request(
        "/directory/users/" +
          encodeURIComponent(id!) +
          "/activity?page=" +
          page,
      );
      setProfile((p) => (p && p.id === id ? { ...p, ...data } : p));
    } catch {
      setError("Uygulama geçmişi yüklenemedi.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      title={
        profile ? profile.firstName + " " + profile.lastName : "Üye profili"
      }
      eyebrow={profile ? "@" + profile.username : "TAKIM DİZİNİ"}
      className="member-profile"
    >
      {error && (
        <div role="alert">
          <p>{error}</p>
          <Button onClick={() => setAttempt((n) => n + 1)}>Yeniden dene</Button>
        </div>
      )}
      {!profile && !error && <p role="status">Profil yükleniyor…</p>}
      {profile && (
        <>
          <section>
            <h3>Departman ve ekipler</h3>
            {profile.memberships.length ? (
              <div className="profile-memberships">
                {profile.memberships.map((m, i) => (
                  <div key={i}>
                    <span>{m.department}</span>
                    <strong>{m.team ?? "Departman üyesi"}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p>Henüz bir ekip atanmamış.</p>
            )}
          </section>
          <ApplicationHistoryView data={profile} onPage={page} busy={busy} />
        </>
      )}
    </Drawer>
  );
}
export function TeamDirectory({
  currentUserId,
  teamsOnly = false,
}: {
  currentUserId: string;
  teamsOnly?: boolean;
}) {
  const [view, setView] = useState(teamsOnly ? "teams" : "people"),
    [query, setQuery] = useState(""),
    [department, setDepartment] = useState(""),
    [team, setTeam] = useState(""),
    [page, setPage] = useState(1),
    [result, setResult] = useState<DirectoryPage | null>(null),
    [org, setOrg] = useState<DirectoryTeams>({ departments: [], teams: [] }),
    [selected, setSelected] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    request("/directory/teams")
      .then((data) => {
        if (live) setOrg(data);
      })
      .catch(() => {
        if (live)
          setError(
            "Takım dizinine erişilemiyor. Takım üyeliğini ve bağlantını kontrol et.",
          );
      });
    return () => {
      live = false;
    };
  }, [retry]);
  useEffect(() => {
    let live = true;
    setBusy(true);
    setError("");
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ page: String(page) });
      if (query) params.set("q", query);
      if (department) params.set("departmentId", department);
      if (team) params.set("teamId", team);
      request("/directory/users?" + params)
        .then((data) => {
          if (live) setResult(data);
        })
        .catch(() => {
          if (live) {
            setResult(null);
            setError(
              "Üyeler yüklenemedi. Takıma katılmamış hesaplar dizine erişemez.",
            );
          }
        })
        .finally(() => {
          if (live) setBusy(false);
        });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, department, team, page, retry]);
  function reset() {
    setQuery("");
    setDepartment("");
    setTeam("");
    setPage(1);
  }
  function browse(departmentId: string, teamId = "") {
    setDepartment(departmentId);
    setTeam(teamId);
    setQuery("");
    setPage(1);
    setView("people");
  }
  const filteredTeams = org.teams.filter(
    (t) => !department || t.departmentId === department,
  );
  return (
    <div className="team-directory">
      <div className="directory-heading">
        <div>
          <span className="eyebrow">YILDIZ ROKET TAKIMI</span>
          <h1>{teamsOnly ? "Ekipler" : "Takım dizini"}</h1>
        </div>
        <Button variant="bare" onClick={() => setSelected(currentUserId)}>
          Profilimi görüntüle <ArrowUpRight size={15} />
        </Button>
      </div>
      <TabBar
        label="Takım dizini görünümü"
        value={view}
        onChange={setView}
        items={[
          { value: "people", label: "Üyeler", icon: <Users size={16} /> },
          { value: "teams", label: "Ekipler", icon: <Layers size={16} /> },
        ]}
      />
      {view === "people" ? (
        <>
          <div className="directory-filters">
            <SearchField
              label="Üye ara"
              placeholder="İsim, soyisim veya kullanıcı adı ara"
              value={query}
              maxLength={80}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
            <SelectMenu
              label="Departmana göre filtrele"
              value={department}
              options={[
                { value: "", label: "Tüm departmanlar" },
                ...org.departments.map((d) => ({ value: d.id, label: d.name })),
              ]}
              onChange={(v) => {
                setDepartment(v);
                setTeam("");
                setPage(1);
              }}
            />
            <SelectMenu
              label="Ekibe göre filtrele"
              value={team}
              options={[
                { value: "", label: "Tüm ekipler" },
                ...filteredTeams.map((t) => ({ value: t.id, label: t.name })),
              ]}
              onChange={(v) => {
                setTeam(v);
                setPage(1);
              }}
            />
          </div>
          <div className="directory-results-heading">
            <span aria-live="polite">
              {busy ? "Aranıyor…" : `${result?.total ?? 0} üye`}
            </span>
            {(query || department || team) && (
              <Button variant="bare" onClick={reset}>
                Filtreleri temizle
              </Button>
            )}
          </div>
          {error ? (
            <EmptyState
              title="Dizin yüklenemedi"
              description={error}
              action={
                <Button onClick={() => setRetry((n) => n + 1)}>
                  <RefreshCw size={15} /> Yeniden dene
                </Button>
              }
            />
          ) : result?.users.length ? (
            <>
              <div className="member-grid" aria-busy={busy}>
                {result.users.map((u) => (
                  <Button
                    key={u.id}
                    className="member-card"
                    onClick={() => setSelected(u.id)}
                  >
                    <span className="member-initials" aria-hidden="true">
                      {u.firstName[0]}
                      {u.lastName[0]}
                    </span>
                    <span className="member-card-body">
                      <strong>
                        {u.firstName} {u.lastName}
                      </strong>
                      <span>@{u.username}</span>
                      <small>
                        {u.memberships.length
                          ? u.memberships
                              .map((m) => m.team ?? m.department)
                              .join(" · ")
                          : "Ekip atanmamış"}
                      </small>
                    </span>
                    <ArrowUpRight size={16} />
                  </Button>
                ))}
              </div>
              <div className="directory-pagination">
                <Button
                  disabled={busy || page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ArrowLeft size={14} /> Önceki
                </Button>
                <span>Sayfa {page}</span>
                <Button
                  disabled={busy || !result.hasMore}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Sonraki <ChevronRight size={14} />
                </Button>
              </div>
            </>
          ) : (
            !busy && (
              <EmptyState
                title="Üye bulunamadı"
                description="Başka bir isim ara veya ekip filtresini değiştir."
              />
            )
          )}
        </>
      ) : (
        <div className="directory-departments">
          {org.departments.map((d) => (
            <Panel
              key={d.id}
              title={d.name}
              action={
                <Button variant="bare" onClick={() => browse(d.id)}>
                  {d.memberCount} üye <ArrowUpRight size={14} />
                </Button>
              }
            >
              <div className="directory-team-list">
                {org.teams
                  .filter((t) => t.departmentId === d.id)
                  .map((t) => (
                    <Button
                      key={t.id}
                      variant="bare"
                      onClick={() => browse(d.id, t.id)}
                    >
                      <span>{t.name}</span>
                      <span>
                        {t.memberCount} üye <ChevronRight size={14} />
                      </span>
                    </Button>
                  ))}
              </div>
              {!org.teams.some((t) => t.departmentId === d.id) && (
                <p>Henüz ekip eklenmemiş.</p>
              )}
            </Panel>
          ))}
        </div>
      )}
      <MemberProfile id={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
export function MyApplicationHistory() {
  const [data, setData] = useState<ApplicationHistory | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load(page = 1) {
    setBusy(true);
    setError("");
    try {
      setData(await request("/me/applications?page=" + page));
    } catch {
      setError("Uygulama geçmişi yüklenemedi.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      {error && (
        <p role="alert">
          {error}
          <Button variant="bare" onClick={() => load()}>
            Yeniden dene
          </Button>
        </p>
      )}
      {data ? (
        <ApplicationHistoryView data={data} onPage={load} busy={busy} />
      ) : (
        !error && <p role="status">Uygulama geçmişi yükleniyor…</p>
      )}
    </>
  );
}
