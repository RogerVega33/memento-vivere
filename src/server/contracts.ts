import type { Memory, Profile, Snapshot, User } from '../domain/types';

export type Photo = { id: string; data: Uint8Array; width: number; height: number };
export type SaveInput = {
  id: string | null; draft: unknown; retainedPhotoIds: string[];
  photos: Photo[]; version: number | null;
};
export interface LifeRepository {
  uploadInProgress: boolean;
  requireProfile(): Promise<Profile>;
  setup(birthDate: string): Promise<Profile>;
  snapshot(query?: string): Promise<Snapshot>;
  listMonth(key: string): Promise<Memory[]>;
  save(input: SaveInput, newId: string): Promise<Memory>;
  delete(id: string, version: number): Promise<void>;
  getPhoto(id: string): Promise<Photo | null>;
}
export type Account = { user: User; repository: LifeRepository };
export type Access = { user: User; token: string; recoveryPhrase?: string };
export interface AuthStore {
  authenticate(token: string | null): Promise<Account | null>;
  register(input: unknown, previousToken?: string | null): Promise<Access>;
  login(input: unknown, previousToken?: string | null): Promise<Access>;
  recover(input: unknown, previousToken?: string | null): Promise<Access>;
  changePassword(input: unknown, token: string | null): Promise<User>;
  logout(token: string | null): Promise<void>;
}

type SqlResult<Row> = { rows: Row[]; rowCount: number | null };
export interface SqlClient {
  query<Row = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<SqlResult<Row>>;
  release(error?: boolean): void;
}
export interface SqlPool { connect(): Promise<SqlClient>; end(): Promise<void> }
