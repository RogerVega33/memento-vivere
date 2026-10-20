export type User = { id: string; username: string };
export type SessionResponse = { user: User | null };
export type AuthResponse = { user: User; recoveryPhrase?: string };

export type Profile = {
  birthDate: string;
  horizonYears: number;
  createdAt: string;
};

export type MemoryDraft = {
  title: string;
  description: string;
  tags: string[];
  year: number;
  month: number;
  day: number | null;
  precision: 'DAY' | 'MONTH';
};

export type Memory = MemoryDraft & {
  id: string;
  photoIds: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type Snapshot = {
  profile: Profile | null;
  today: string;
  monthCounts: Record<string, number>;
  memoryCount: number;
  photoCount: number;
  search?: {
    query: string;
    monthCounts: Record<string, number>;
    memoryCount: number;
  };
};
