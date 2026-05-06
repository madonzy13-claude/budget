export interface CredentialRepo {
  hashAndStorePassword(userId: string, password: string): Promise<void>;
  verifyPassword(email: string, password: string): Promise<{ userId: string } | null>;
}
