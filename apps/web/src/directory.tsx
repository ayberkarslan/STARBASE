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
import "./directory.css";
export function ApplicationHistoryView({
  data,
  onPage: _onPage,
  busy: _busy = false,
}: {
  data: ApplicationHistory;
  onPage: (page: number) => void;
  busy?: boolean;
}) {
  return (
    <section className="profile-activity">
      <h3><AppWindow size={17} /> Kullandığı uygulamalar</h3>
      {data.applications.length ? (
        <div className="usage-list">
          {data.applications.map((a) => (
            <div className="usage-app" key={a.applicationId}>
              {"logoUrl" in a && typeof a.logoUrl === "string" && a.logoUrl ? <img src={a.logoUrl} alt="" /> : <AppWindow size={18} />}
              <span>{a.applicationName}</span>
            </div>
          ))}
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
          <ApplicationHistoryView data={profile as unknown as ApplicationHistory} onPage={() => {}} busy={busy} />
        </>
      )}
    </Drawer>
  );
}
export function TeamDirectory({
  currentUserId,
  teamsOnly = false,
  canManageOrganization = false,
}: {
  currentUserId: string;
  teamsOnly?: boolean;
  canManageOrganization?: boolean;
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
    setSelectedTeam(teamId || null);
  }
  async function uploadTeamLogo(id: string, file: File) {
    if (!file.type.match(/^image\/(png|jpeg|webp)$/) || file.size > 1048576) {
      setError("Logo PNG, JPEG veya WebP olmalı ve 1 MB'ı geçmemeli.");
      return;
    }
    try {
      const response = await fetch(`/api/v1/admin/teams/${encodeURIComponent(id)}/logo`, {
        method: "POST", headers: { "Content-Type": file.type }, body: file,
      });
      if (!response.ok) throw new Error();
      setRetry((n) => n + 1);
    } catch { setError("Ekip logosu yüklenemedi."); }
  }
  const filteredTeams = org.teams.filter(
    (t) => !department || t.departmentId === department,
  );
  return (
    <div className="team-directory">
      <div className="directory-heading">
        <div>
          <span className="eyebrow">YILDIZ ROKET TAKIMI</span>
          <h1>{selectedTeam ? org.teams.find((t) => t.id === selectedTeam)?.name ?? "Ekip" : teamsOnly ? "Ekipler" : "Takım dizini"}</h1>
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
                      <span className="team-patch">{t.logoUrl ? <img src={t.logoUrl} alt="" /> : <Layers size={16} />} </span><strong>{t.name}</strong>
                      <span>
                        {t.memberCount} üye <ChevronRight size={14} />
                      </span>
                    </Button>
                  ))}
                {canManageOrganization && org.teams.filter((t) => t.departmentId === d.id).map((t) => (
                  <label className="team-logo-upload" key={`${t.id}-logo`}>
                    {t.name} için patch
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadTeamLogo(t.id, file); }} />
                  </label>
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
