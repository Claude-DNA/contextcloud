/**
 * Reference characters for casting temperature (predictability) and persistence (easy-going … stubborn).
 * First estimates, until the engine is calibrated on the source texts (spec: Testing and calibration).
 */
import type { ReferenceWeight } from './types';

export interface ReferenceCharacter {
  name: string;
  work: string;
  temperature: number;
  persistence: number;
}

export const REFERENCE_CHARACTERS: ReferenceCharacter[] = [
  { name: 'Jean-Luc Picard', work: 'Star Trek: The Next Generation', temperature: 0.15, persistence: 0.5 },
  { name: 'Spock', work: 'Star Trek', temperature: 0.1, persistence: 0.6 },
  { name: 'James T. Kirk', work: 'Star Trek', temperature: 0.45, persistence: 0.3 },
  { name: 'Clyde Griffiths', work: 'An American Tragedy (Dreiser)', temperature: 0.2, persistence: 0.4 },
  { name: 'Carrie Meeber', work: 'Sister Carrie (Dreiser)', temperature: 0.2, persistence: 0.2 },
  { name: 'Frank Cowperwood', work: 'The Financier (Dreiser)', temperature: 0.15, persistence: 0.75 },
  { name: 'Elizabeth Bennet', work: 'Pride and Prejudice', temperature: 0.35, persistence: 0.6 },
  { name: 'Fitzwilliam Darcy', work: 'Pride and Prejudice', temperature: 0.25, persistence: 0.8 },
  { name: 'Jay Gatsby', work: 'The Great Gatsby', temperature: 0.3, persistence: 0.95 },
  { name: 'Captain Ahab', work: 'Moby-Dick', temperature: 0.4, persistence: 1 },
  { name: 'Hamlet', work: 'Hamlet', temperature: 0.8, persistence: 0.85 },
  { name: 'Prince Myshkin', work: 'The Idiot (Dostoevsky)', temperature: 0.6, persistence: 0.1 },
  { name: 'Ivan Karamazov', work: 'The Brothers Karamazov (Dostoevsky)', temperature: 0.6, persistence: 0.8 },
  { name: 'Rodion Raskolnikov', work: 'Crime and Punishment (Dostoevsky)', temperature: 0.85, persistence: 0.8 },
  { name: 'Dmitri Karamazov', work: 'The Brothers Karamazov (Dostoevsky)', temperature: 0.9, persistence: 0.6 },
  { name: 'Nastasya Filippovna', work: 'The Idiot (Dostoevsky)', temperature: 0.95, persistence: 0.9 },
];

const BY_NAME = new Map(REFERENCE_CHARACTERS.map((r) => [r.name.toLowerCase(), r]));

export function findReference(name: string): ReferenceCharacter | undefined {
  return BY_NAME.get(name.trim().toLowerCase());
}

/** The weighted blend of a cast, as Audition blends states. Null when nothing in it is known. */
export function blendReferences(cast: ReferenceWeight[] | undefined, pick: 'temperature' | 'persistence'): number | null {
  let total = 0, sum = 0;
  for (const m of cast ?? []) {
    const r = findReference(m.reference);
    if (!r || !(m.weight > 0)) continue;
    total += m.weight;
    sum += m.weight * r[pick];
  }
  return total > 0 ? sum / total : null;
}
