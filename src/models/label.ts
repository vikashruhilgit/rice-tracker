import type { Label } from '../types/index.js';

export function validateLabel(data: Partial<Label>): string[] {
  const errors: string[] = [];
  if (!data.name || data.name.trim().length === 0) errors.push('Label name is required');
  if (data.color && !/^#[0-9a-fA-F]{6}$/.test(data.color)) errors.push('Color must be hex format (#RRGGBB)');
  return errors;
}

export const labelConverter = {
  toFirestore(label: Label) { return { ...label }; },
  fromFirestore(snapshot: { data: () => Record<string, any> }): Label { return snapshot.data() as Label; },
};
