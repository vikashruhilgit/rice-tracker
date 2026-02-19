import { nanoid } from 'nanoid';

const ID_PREFIX = 'rt';
const ID_LENGTH = 6; // 6 chars after prefix = rt-a1b2c3

export function generateId(): string {
  const hash = nanoid(ID_LENGTH).toLowerCase();
  return `${ID_PREFIX}-${hash}`;
}

export function isValidId(id: string): boolean {
  return /^rt-[a-z0-9]{4,8}$/.test(id);
}
