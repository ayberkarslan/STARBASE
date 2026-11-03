export type ProfileScope = "profile" | "email" | "organization";
export interface Profile {
  id: string;
  applicationId?: string;
  username: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  emailVerified?: boolean;
  owner?: boolean;
  memberships?: {
    departmentId: string;
    department: string;
    teamId: string | null;
    team: string | null;
  }[];
}
export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface TeamMembership {
  departmentId: string;
  department: string;
  teamId: string | null;
  team: string | null;
}
export interface DirectoryUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  memberships: TeamMembership[];
}
export interface DirectoryPage {
  users: DirectoryUser[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}
export type SessionEndReason = "logout" | "revoked" | "expired";
export interface ApplicationUsage {
  applicationId: string;
  applicationName: string;
  applicationDisabled: number;
  lastSignInAt: number;
  lastSignOutAt: number | null;
  lastEndAt: number | null;
  lastEndReason: SessionEndReason | null;
}
export interface ApplicationVisit {
  id: string;
  applicationId: string;
  applicationName: string;
  signedInAt: number;
  endedAt: number | null;
  endReason: SessionEndReason | null;
}
export interface ApplicationHistory {
  applications: ApplicationUsage[];
  visits: ApplicationVisit[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}
export interface ProfileApplication {
  applicationId: string;
  applicationName: string;
  logoUrl: string;
}
export interface DirectoryProfile extends DirectoryUser {
  applications: ProfileApplication[];
}
export interface DirectoryTeams {
  departments: { id: string; name: string; memberCount: number }[];
  teams: {
    id: string;
    name: string;
    departmentId: string;
    memberCount: number;
    logoUrl: string;
  }[];
}
