/**
 * CLEAN fixture: tokenizer resistance. Comments, strings, template
 * literals, regex literals and division operators must never produce
 * phantom imports (false positives) — and a REAL violation hidden inside
 * a comment or string must never be silently missed either way: this
 * fixture asserts the engine reports exactly nothing for it.
 */
const note = "// import bad from \"@zcode/rpc\"";
const blockNote = "/* import bad2 from \"openai\" */";
const templateNote = `import bad3 from "livekit"`;
const regexWithQuotes = /["'`]/g;
const division = 100 / 5 / 2;
const punct = { a: [1, 2], b: { c: 3 } };
const chained = "x".replace(/x/g, "y").split(",").join(";");
const dynamic = import;
const spread = [...punct.a, ...punct.b.c ? [1] : [2]];

export const surface = {
  note,
  blockNote,
  templateNote,
  regexWithQuotes,
  division,
  punct,
  chained,
  dynamic,
  spread,
};
