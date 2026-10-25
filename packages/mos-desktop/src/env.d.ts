/**
 * Build-time environment surface of the MOS desktop shell's CONSOLE
 * (the payswap-pattern product surface, W32).
 *
 * The console's stylesheet is imported side-effect-first from the
 * section modules (mirrors @payswap/app's pattern: consumers bring the
 * token layer first, the component styles second). Vite resolves the CSS
 * at build time; this declaration keeps the TypeScript program honest
 * about the import.
 */
declare module "*.css";
