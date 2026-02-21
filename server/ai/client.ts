// ============================================================
// Chimera Arena - Shared Gemini Client Setup
// ============================================================

import { GoogleGenAI } from '@google/genai';

// Lazy-initialized so server can start without an API key (uses fallback chimeras)
let _ai: GoogleGenAI | null = null;

export function getAI(): GoogleGenAI {
  if (!_ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY is not set. Add it to your .env file.');
    }
    _ai = new GoogleGenAI({ apiKey: key });
  }
  return _ai;
}
