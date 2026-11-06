export type MemberStatus = "active" | "pending" | "banned";

export function memberStatus(user: { disabled: number | boolean; verified: number | boolean }): MemberStatus {
  return user.disabled ? "banned" : user.verified ? "active" : "pending";
}

export const memberStatusOptions: { value: MemberStatus; label: string }[] = [
  { value: "active", label: "Aktif · e-posta onaylı" },
  { value: "pending", label: "Beklemede · e-posta onayı gerekli" },
  { value: "banned", label: "Yasaklı · giriş kapalı" },
];

export const memberStatusLabel: Record<MemberStatus, string> = {
  active: "Aktif",
  pending: "Beklemede",
  banned: "Yasaklı",
};
