export type WordType = 'noun' | 'verb' | 'other';
export type MemoryRoute = 'E' | 'T' | 'S' | '';
export type Confidence = 'new' | 'learning' | 'proficient';
export type Difficulty = 'unrated' | 'hard' | 'medium' | 'easy';
export type Entry = {
  id: string; type: WordType; word: string; meaning: string; article: string;
  plural: string; pluralPattern: string; memoryRoute: MemoryRoute; mnemonic: string;
  storyGroup: string; example: string; notes: string; source: string; tags: string;
  confidence: Confidence; difficulty: Difficulty; streak: number; reviewCount: number; dueAt: string; createdAt: string; updatedAt: string;
};
export const emptyEntry: Entry = { id: '', type: 'noun', word: '', meaning: '', article: '', plural: '', pluralPattern: '', memoryRoute: '', mnemonic: '', storyGroup: '', example: '', notes: '', source: 'Hueber Thesaurus', tags: '', confidence: 'new', difficulty: 'unrated', streak: 0, reviewCount: 0, dueAt: '', createdAt: '', updatedAt: '' };
export const pluralPatterns = [
  ['none', 'No change · Lehrer → Lehrer'],
  ['umlaut', 'Umlaut only · Bruder → Brüder'],
  ['e', '-e · Heft → Hefte'],
  ['umlaut-e', 'Umlaut + -e · Satz → Sätze'],
  ['er', '-er · Kind → Kinder'],
  ['umlaut-er', 'Umlaut + -er · Buch → Bücher'],
  ['n', '-n · Name → Namen'],
  ['en', '-en · Antwort → Antworten'],
  ['nen', '-nen · Lehrerin → Lehrerinnen'],
  ['s', '-s · Auto → Autos'],
  ['irregular', 'Irregular · Thema → Themen'],
] as const;
