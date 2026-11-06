import { useEffect, useState } from "react";
import {
  Button,
  Panel,
  EmptyState,
  SearchField,
  SelectMenu,
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
import { compactPatch } from "./image-upload";
import "./directory.css";
export function ApplicationHistoryView({
  data,
  onPage: _onPage,
  busy: _busy = false,
  onSelectApplication,
}: {
  data: ApplicationHistory;
  onPage: (page: number) => void;
  busy?: boolean;
  onSelectApplication?: (id: string) => void;
}) {
  return (
    <section className="profile-activity">
      <h3><AppWindow size={17} /> Kullandığı uygulamalar</h3>
      {data.applications.length ? (
        <div className="usage-list">
          {data.applications.map((a) => {
            const canOpen = Boolean(onSelectApplication && !a.applicationDisabled);
            const content = <>
              {"logoUrl" in a && typeof a.logoUrl === "string" && a.logoUrl ? <img src={a.logoUrl} alt="" /> : <AppWindow size={18} />}
              <span>{a.applicationName}</span>
              {canOpen && <ArrowUpRight size={14} aria-hidden="true" />}
            </>;
            return canOpen
              ? <button type="button" className="usage-app usage-app--link" key={a.applicationId} onClick={() => onSelectApplication?.(a.applicationId)} aria-label={`${a.applicationName} uygulama sayfasını aç`}>{content}</button>
              : <div className="usage-app" key={a.applicationId}>{content}</div>;
          })}
        </div>
      ) : (
        <EmptyState
          title="Henüz uygulama girişi yok"
          description="STARBASE ile kullandığın uygulamalar burada görünecek."
        />
      )}
    </section>
  );
}
function MemberProfile({
  id,
  onClose,
  revision,
}: {
  id: string | null;
  onClose: () => void;
  revision: number;
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
  }, [id, attempt, revision]);
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
        <div className="directory-profile">
          <section className="directory-profile__hero">
            <span className="directory-profile__avatar" aria-hidden="true">
              {profile.photoUrl ? <img src={profile.photoUrl} alt="" /> : <>{profile.firstName[0]}{profile.lastName[0]}</>}
            </span>
            <div>
              <h3>{profile.firstName} {profile.lastName}</h3>
              <p>@{profile.username}</p>
            </div>
          </section>
          <section className="directory-profile__section">
            <span className="eyebrow">EKİPLER</span>
            {profile.memberships.length ? (
              <div className="profile-memberships">
                {profile.memberships.map((m, i) => (
                  <div key={i}>
                    <span>{m.department}</span><strong>{m.team ?? "Departman üyesi"}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p>Henüz bir ekip atanmamış.</p>
            )}
          </section>
          <ApplicationHistoryView data={profile as unknown as ApplicationHistory} onPage={() => {}} busy={busy} />
        </div>
      )}
    </Drawer>
  );
}
export function TeamDirectory({
  currentUserId,
  teamsOnly = false,
  canManageOrganization = false,
  revision = 0,
}: {
  currentUserId: string;
  teamsOnly?: boolean;
  canManageOrganization?: boolean;
  revision?: number;
}) {
  const [query, setQuery] = useState(""),
    [department, setDepartment] = useState(""),
    [team, setTeam] = useState(""),
    [page, setPage] = useState(1),
    [result, setResult] = useState<DirectoryPage | null>(null),
    [org, setOrg] = useState<DirectoryTeams>({ departments: [], teams: [] }),
    [selected, setSelected] = useState<string | null>(null),
    [selectedTeam, setSelectedTeam] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    request("/directory/teams")
      .then((data) => {
        if (live) setOrg(data);
      })
      .catch((cause) => {
        if (live)
          setError(
            (cause as Error).message === "team_membership_required"
              ? "Takım dizini yalnız ekip üyelerine açık. Yönetici hesabına bir ekip üyeliği ata."
              : "Takım dizini yüklenemedi. Sunucu migration'larını güncelle ve yeniden dene.",
          );
      });
    return () => {
      live = false;
    };
  }, [retry, revision]);
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
        .catch((cause) => {
          if (live) {
            setResult(null);
            setError(
              (cause as Error).message === "team_membership_required"
                ? "Üyeler yalnız ekip üyelerine açık. Hesabına ekip üyeliği ata."
                : "Üyeler yüklenemedi. Sunucu migration'larını güncelle ve yeniden dene.",
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
  }, [query, department, team, page, retry, revision]);
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
    setSelectedTeam(teamId || null);
  }
  async function uploadDepartmentLogo(id: string, file: File) {
    try {
      const image = await compactPatch(file);
      const response = await fetch(`/api/v1/admin/departments/${encodeURIComponent(id)}/logo`, {
        method: "POST", headers: { "Content-Type": image.type }, body: image,
      });
      const result = await response.json() as { logoUrl: string };
      if (!response.ok) throw new Error("Departman patch'i yüklenemedi.");
      setOrg((current) => ({
        ...current,
        departments: current.departments.map((department) =>
          department.id === id
            ? { ...department, logoUrl: `${result.logoUrl}?v=${Date.now()}` }
            : department,
        ),
      }));
    } catch (error) { setError(error instanceof Error ? error.message : "Departman patch'i yüklenemedi."); }
  }
  const filteredTeams = org.teams.filter(
    (t) => !department || t.departmentId === department,
  );
  return (
    <div className="team-directory">
      <div className="directory-heading">
        <div>
          <span className="eyebrow">YILDIZ ROKET TAKIMI</span>
          <h1>{selectedTeam ? org.teams.find((t) => t.id === selectedTeam)?.name ?? "Ekip" : teamsOnly ? "Departmanlar" : "Takım dizini"}</h1>
        </div>
        <Button variant="bare" onClick={() => setSelected(currentUserId)}>
          Profilimi görüntüle <ArrowUpRight size={15} />
        </Button>
      </div>
      {(!teamsOnly || selectedTeam) ? (
        <>
          {selectedTeam && <Button variant="bare" onClick={() => { setSelectedTeam(null); reset(); }}><ArrowLeft size={15} /> Ekip listesine dön</Button>}
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
                      {u.photoUrl ? <img src={u.photoUrl} alt="" /> : <>{u.firstName[0]}{u.lastName[0]}</>}
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
              title={<span className="department-title">{d.logoUrl ? <img src={d.logoUrl} alt="" /> : <Layers size={22} />}{d.name}</span>}
              action={<div className="department-actions">
                <Button variant="bare" onClick={() => browse(d.id)}>{d.memberCount} üye <ArrowUpRight size={14} /></Button>
                {canManageOrganization && <label className="department-logo-upload">
                  Patch seç
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadDepartmentLogo(d.id, file); }} />
                </label>}
              </div>}
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
                      <span className="team-patch">{t.logoUrl ? <img src={t.logoUrl} alt="" /> : <Layers size={16} />} </span><strong>{t.name}</strong>
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
      <MemberProfile id={selected} onClose={() => setSelected(null)} revision={revision} />
    </div>
  );
}
export function MyApplicationHistory({ onSelectApplication }: { onSelectApplication: (id: string) => void }) {
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
        <ApplicationHistoryView data={data} onPage={load} busy={busy} onSelectApplication={onSelectApplication} />
      ) : (
        !error && <p role="status">Uygulama geçmişi yükleniyor…</p>
      )}
    </>
  );
}
