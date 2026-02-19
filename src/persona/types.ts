/** Style analysis computed from the user's chat history. */
export interface StyleNotes {
  /** Average message length in characters. */
  avgLength: number;
  /** How often the user uses emoji (0-1 ratio of messages containing emoji). */
  emojiFrequency: number;
  /** Whether the user typically uses lowercase. */
  lowercaseDominant: boolean;
  /** Common punctuation habits (e.g. "rarely uses periods", "lots of exclamation marks"). */
  punctuationNotes: string[];
  /** Frequently used phrases or words. */
  commonPhrases: string[];
}

/** The full persona definition produced by the ingest script. */
export interface PersonaData {
  /** Display name used in the system prompt. */
  displayName: string;
  /** Representative sample of the user's real messages. */
  exampleMessages: string[];
  /** Computed style analysis. */
  styleNotes: StyleNotes;
}
