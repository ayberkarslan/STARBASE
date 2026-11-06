import { useState, type FormEvent } from "react";
import { Button, Dialog, TextField } from "@stardrop/ui";
import { UserPlus } from "lucide-react";
import { FormSelect } from "./form-select";
import { request } from "./management";
interface CreatedMember {
  user: {
    id: string;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
  };
  verificationDelivered: boolean;
  verificationSkipped: boolean;
  developmentVerificationUrl?: string;
}
const errors: Record<string, string> = {
  member_already_exists: "Bu kullanıcı adı veya e-posta zaten kullanılıyor.",
  reauthentication_required: "Yönetici şifren hatalı.",
  invalid_team: "Seçilen ekip artık kullanılamıyor.",
  invalid_input: "Alanları kontrol et; geçici şifre en az 12 karakter olmalı.",
  member_creation_failed:
    "Hesap oluşturulamadı. E-posta adresini ve şifreyi kontrol et.",
  member_creation_incomplete:
    "Hesap kurulumu tamamlanamadı. Yeniden denemeden önce üye listesini kontrol et.",
  try_later: "Çok fazla deneme. Biraz sonra yeniden dene.",
};
export function CreateMember({
  org,
  onCreated,
}: {
  org: { departments: any[]; teams: any[] };
  onCreated: (result: CreatedMember) => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const result: CreatedMember = await request("/admin/users", {
        username: data.get("username"),
        firstName: data.get("firstName"),
        lastName: data.get("lastName"),
        email: data.get("email"),
        temporaryPassword: data.get("temporaryPassword"),
        currentPassword: data.get("currentPassword"),
        teamId: data.get("teamId") || null,
        skipEmailVerification: data.has("skipEmailVerification"),
      });
      form.reset();
      setOpen(false);
      await onCreated(result);
    } catch (e) {
      const code = (e as Error).message;
      setError(
        errors[code] ??
          "İşlem tamamlanamadı. Üye listesini kontrol edip tekrar dene.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        <UserPlus size={16} /> Üye ekle
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Üye ekle"
        description="Geçici şifreyi üyeye ilet. İlk girişte kendi şifresini belirlemesi istenecek."
      >
        <form onSubmit={submit}>
          <div className="field-pair">
            <TextField label="İsim" name="firstName" required maxLength={80} />
            <TextField
              label="Soyisim"
              name="lastName"
              required
              maxLength={80}
            />
          </div>
          <TextField
            label="Kullanıcı adı"
            name="username"
            required
            minLength={3}
            maxLength={32}
            autoComplete="off"
          />
          <TextField
            label="E-posta"
            name="email"
            type="email"
            required
            autoComplete="off"
          />
          <label>
            Ekip
            <FormSelect name="teamId">
              <option value="">Atama yapma</option>
              {org.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {org.departments.find((d) => d.id === t.department_id)?.name}{" "}
                  / {t.name}
                </option>
              ))}
            </FormSelect>
          </label>
          <TextField
            label="Geçici şifre"
            name="temporaryPassword"
            type="password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            required
          />
          <label className="member-access-toggle">
            <input name="skipEmailVerification" type="checkbox" />
            <span>E-posta onayını atla · hesabı doğrudan etkinleştir</span>
          </label>
          <TextField
            label="Yönetici şifren"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
          {error && (
            <p className="message error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" loading={busy}>
            Üyeyi oluştur
          </Button>
        </form>
      </Dialog>
    </>
  );
}
