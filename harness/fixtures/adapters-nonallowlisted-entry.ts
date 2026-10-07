/**
 * VIOLATION fixture (rule b): @zcode packages that EXIST in the substrate
 * but are NOT on the entry allowlist (@zcode/web, @zcode/desktop). Import
 * forms (static + type-only + side-effect) are irrelevant — the entry name
 * decides.
 */
import { WebThing } from "@zcode/web";
import type { DesktopThing } from "@zcode/desktop";
import "@zcode/web/styles.css";

export const surface = { WebThing, DesktopThing };
