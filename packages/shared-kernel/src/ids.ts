import { uuidv7 } from 'uuidv7';

export type TenantId = string & { readonly __brand: 'TenantId' };
export type UserId = string & { readonly __brand: 'UserId' };

export const TenantId = Object.assign((s: string): TenantId => s as TenantId, {});
export const UserId = Object.assign((s: string): UserId => s as UserId, {});

export const newTenantId = (): TenantId => uuidv7() as TenantId;
export const newUserId = (): UserId => uuidv7() as UserId;
