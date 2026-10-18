/**
 * Shared types for the AI assistant feature.
 *
 * Mirrors backend/app/schemas/ai.py. When the backend schemas change, update
 * this file in the same PR — there is no codegen pipeline yet (Week 5 backlog).
 */

export interface Citation {
  /** 1-based index matching the bracketed marker in `answer` text. */
  index: number;
  /** Originating event_id from AI Search. Stable across re-indexes. */
  source_id: string;
  /** "member" today; "claim" / "encounter" once those aggregates ship. */
  aggregate_type: string;
  /** Domain id (e.g. member_id). */
  aggregate_id: string;
  /** Deep link the chip navigates to on click. Relative to the SPA root. */
  url: string;
  /** Short excerpt for the chip tooltip. */
  snippet: string;
}

export interface AskRequest {
  question: string;
  /** Narrow retrieval to a specific member. Set when the panel is opened
   *  inside Member360. */
  member_id?: string;
  top_k?: number;
}

export interface AskResponse {
  answer: string;
  citations: Citation[];
  /** False = no context retrieved; treat the answer as ungrounded. */
  grounded: boolean;
  model: string;
  retrieved_count: number;
}

export interface AskError {
  detail: string;
}
