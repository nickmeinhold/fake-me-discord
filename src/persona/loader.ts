import { readFileSync } from "node:fs";
import type { PersonaData } from "./types.js";

/**
 * Load the persona definition from a JSON file.
 * Performs basic structural validation to catch obvious problems early.
 */
export function loadPersona(path = "data/persona.json"): PersonaData {
  const raw = readFileSync(path, "utf-8");
  const data = JSON.parse(raw) as PersonaData;

  if (!data.displayName || typeof data.displayName !== "string") {
    throw new Error("persona.json: missing or invalid displayName");
  }
  if (!Array.isArray(data.exampleMessages) || data.exampleMessages.length === 0) {
    throw new Error("persona.json: exampleMessages must be a non-empty array");
  }
  if (!data.styleNotes || typeof data.styleNotes.avgLength !== "number") {
    throw new Error("persona.json: missing or invalid styleNotes");
  }

  console.log(
    `Loaded persona "${data.displayName}" with ${data.exampleMessages.length} example messages`,
  );
  return data;
}
