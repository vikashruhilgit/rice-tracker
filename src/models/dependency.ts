import { Timestamp } from 'firebase/firestore';
import type { Dependency } from '../types/index.js';

export function validateDependency(data: Partial<Dependency>): string[] {
  const errors: string[] = [];
  if (!data.fromId) errors.push('fromId is required');
  if (!data.toId) errors.push('toId is required');
  if (data.fromId === data.toId) errors.push('Cannot create self-dependency');
  if (data.type && !['blocks', 'related', 'parent_child', 'discovered_from', 'duplicates', 'supersedes', 'replies_to'].includes(data.type)) errors.push('Invalid dependency type');
  return errors;
}

export const dependencyConverter = {
  toFirestore(dep: Dependency) {
    return { ...dep, createdAt: Timestamp.fromDate(dep.createdAt) };
  },
  fromFirestore(snapshot: { data: () => Record<string, any> }): Dependency {
    const data = snapshot.data();
    return { ...data, createdAt: data.createdAt?.toDate() ?? new Date() } as Dependency;
  },
};
