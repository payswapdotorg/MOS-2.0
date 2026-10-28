/**
 * The MOS PLUGIN MARKETPLACE presentation vocabulary (W37).
 *
 * The copy constants + pure presentation helpers for the Marketplace
 * console section — the substrate's Plugin Marketplace page copy held
 * verbatim (captured from the packaged app's store view), so the section
 * and its tests share one truth. Pure module: no imports, no state.
 */

/** The store page's own title line. */
export const MOS_MARKETPLACE_TITLE = 'Plugin Marketplace';

/** The store page's own description line (verbatim). */
export const MOS_MARKETPLACE_DESCRIPTION =
  'Extend ZCode with skills, commands, and MCP servers from plugins';

/** The store header's Add affordance label (verbatim). */
export const MOS_MARKETPLACE_ADD_LABEL = 'Add';

/** The store header's Installed management affordance label (verbatim). */
export const MOS_MARKETPLACE_INSTALLED_LABEL = 'Installed';

/** The Public segment label (the store's own pill). */
export const MOS_MARKETPLACE_SEGMENT_PUBLIC = 'Public';

/** The Personal segment label (the store's own pill). */
export const MOS_MARKETPLACE_SEGMENT_PERSONAL = 'Personal';

/** The Install action label (the store card's own button). */
export const MOS_MARKETPLACE_INSTALL_LABEL = 'Install';

/** The installed-state card label (the store's own installed word). */
export const MOS_MARKETPLACE_INSTALLED_WORD = 'Installed';

/** The category collapse toggle labels (the store's own words). */
export const MOS_MARKETPLACE_SHOW_LESS = 'Show less';
export const MOS_MARKETPLACE_SHOW_MORE = 'Show more';

/** The empty-state line when the Installed view holds no records yet. */
export const MOS_MARKETPLACE_INSTALLED_EMPTY =
  'No installed plugins in this workspace yet — Install from the Public listing records the plugin here.';

/** The honest line under the Personal segment (no personal sources exist in this release). */
export const MOS_MARKETPLACE_PERSONAL_EMPTY =
  'No personal marketplace sources in this release — personal sources arrive with a connected substrate account.';

/** The honest note the Add affordance answers with (the Model Settings precedent). */
export const MOS_MARKETPLACE_ADD_NOTE =
  'The catalog is frozen to the official marketplace listing captured in this build. Adding marketplace sources arrives with a connected substrate account.';

/** The honest note the Installed strip management affordance answers with. */
export const MOS_MARKETPLACE_INSTALLED_NOTE =
  'Installed plugins are workspace records in this profile — the substrate syncs their skills and MCP servers when an account is connected.';

/** The uninstall confirm copy (the substrate's own destructive law). */
export function mosMarketplaceUninstallConfirm(pluginName: string): string {
  return `Uninstall “${pluginName}”? The workspace record is removed; this cannot be undone.`;
}

/** The install receipt (the honest workspace-decision record line). */
export function mosMarketplaceInstallReceipt(
  pluginName: string,
): string {
  return `INSTALLED — ${pluginName} is a workspace record now. The substrate syncs its skills and MCP servers when an account is connected.`;
}

/** The uninstall receipt. */
export function mosMarketplaceUninstallReceipt(pluginName: string): string {
  return `Uninstalled — ${pluginName}'s workspace record was removed.`;
}

/** The marketplace segment (the store's own Public/Personal toggle). */
export type MosMarketplaceSegment = 'public' | 'personal';

/** The store page's per-category collapse threshold (the toggle appears past it). */
export const MOS_MARKETPLACE_CATEGORY_COLLAPSE_AFTER = 10;

/**
 * Whether a category section renders the Show less/Show more toggle
 * (the store shows the toggle only for sections with more items than
 * the collapse threshold).
 */
export function mosMarketplaceCategoryHasToggle(itemCount: number): boolean {
  return itemCount > MOS_MARKETPLACE_CATEGORY_COLLAPSE_AFTER;
}

/** The plugins a collapsed category shows (the threshold count). */
export function mosMarketplaceCollapsedCount(): number {
  return MOS_MARKETPLACE_CATEGORY_COLLAPSE_AFTER;
}
