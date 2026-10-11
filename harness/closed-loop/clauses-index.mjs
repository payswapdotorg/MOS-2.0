// PROD-004 — re-export index so the runner stays under the line cap and the
// clause numbering seam stays single-sourced.

export {
  clause11, clause12, clause13, clause14, clause16,
  clause17, clause18, clause19, clause20, clause21,
} from './clauses-b.mjs';
export { clause15 as clause15Import } from './zero-human.mjs';
