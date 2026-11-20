// Languages of the user interface (strings.ts).
export const LANGUAGES = ['en', 'fi'] as const;
export type Language = (typeof LANGUAGES)[number];
