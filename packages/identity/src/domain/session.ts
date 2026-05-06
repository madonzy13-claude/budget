export class Session {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly device: string,
    public readonly ipAddress: string,
    public readonly createdAt: Date,
    public readonly lastActiveAt: Date,
    public readonly expiresAt: Date,
  ) {}
}
