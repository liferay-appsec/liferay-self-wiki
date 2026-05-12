// Keep in sync with the prose forms in src/templates/skill/SKILL.md and
// src/commands/nudge.js — regex form here drives the second-chance
// detector, prose forms there steer the model's primary instinct.

const PHRASES = [
  /\b(?:done|complete(?:d)?|finished|landed|wrapped up|wrapping up)\b/i,
  /\ball tests pass(?:ing|ed)?\b/i,
  /\btests are green\b/i,
  /\b(?:build|formatter)\s+(?:green|clean)\b/i,
  /\bPR\s*#?\d+\s+(?:opened|merged|ready|created|landed|updated|force-?pushed)\b/i,
  /\bforce-?pushed?\b/i,
  /\bready for review\b/i,
  /\bI(?:'| ha)ve finished\b/i,
  /\bI(?:'m| am) done\b/i,
  /\bimplementation complete\b/i,
  /\bnothing (?:left|more) to do\b/i,
];

// Three-or-more bullets in a row — a multi-bullet wrap-up pattern.
const BULLET_LIST = /(?:^|\n)\s*[-*]\s+\S.*(?:\n\s*[-*]\s+\S.*){2,}/m;

export function looksLikeClosingSummary(text) {
  if (!text) return false;
  if (PHRASES.some((re) => re.test(text))) return true;
  return BULLET_LIST.test(text);
}

export const CLOSING_TELL_PATTERNS = PHRASES;
