/**
 * The MOS PLUGIN MARKETPLACE CATALOG (W37 — the zcode substrate's
 * official plugin marketplace listing, EMERGED as the MOS console's own
 * catalog truth).
 *
 * WHAT THIS MODULE HOLDS: the public marketplace roster exactly as the
 * substrate's Plugin Marketplace page renders it (captured verbatim from
 * the packaged app's store view through the live CDP chain — names,
 * descriptions, category sections, and the `@zcode-plugins-official`
 * id vocabulary). Pure data + pure functions, no imports: directly
 * consumable by the node test runner through the built dist.
 *
 * HONESTY: this catalog is REFERENCE data frozen from the substrate's
 * official marketplace listing — it is not a live marketplace client,
 * nothing here claims an account is connected, and installing a plugin
 * on the native surface records a WORKSPACE DECISION (the substrate
 * syncs the skills/MCP when an account is connected; this surface never
 * executes anything).
 */

/** One marketplace plugin's frozen listing facts. */
export interface MosMarketplacePluginRecord {
  /** The catalog plugin id (the substrate's `{slug}@{marketplace}` form). */
  readonly id: string;
  /** The display name (verbatim from the official listing). */
  readonly name: string;
  /** The listing description (verbatim; the card truncates to one line). */
  readonly description: string;
  /** The category section the listing renders under. */
  readonly categoryId: MosMarketplaceCategoryId;
  /** The listing icon (the official CDN asset; the card falls back to the initial tile when it cannot load). */
  readonly iconUrl: string;
}

/** The marketplace category sections (the store page's own headings). */
export type MosMarketplaceCategoryId =
  | 'developer-tools'
  | 'productivity'
  | 'finance'
  | 'other'
  | 'games-3d';

/** One category section descriptor (display name verbatim, incl. the CJK heading). */
export interface MosMarketplaceCategoryDescriptor {
  readonly id: MosMarketplaceCategoryId;
  /** The section heading exactly as the store renders it. */
  readonly label: string;
}

/** The categories in the store page's own order. */
export const MOS_MARKETPLACE_CATEGORIES: readonly MosMarketplaceCategoryDescriptor[] = [
  { id: 'developer-tools', label: 'Developer Tools' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'finance', label: 'Finance' },
  { id: 'other', label: 'Other' },
  { id: 'games-3d', label: '游戏/3D' },
];

const OFFICIAL_MARKETPLACE_ID = 'zcode-plugins-official';

/** The official listing icon CDN pattern (the store card's own src). */
function officialIcon(slug: string): string {
  return `https://cdn-zcode.z.ai/zcode/official-plugin/assets/${slug}/icon.png`;
}

function plugin(
  slug: string,
  name: string,
  description: string,
  categoryId: MosMarketplaceCategoryId,
): MosMarketplacePluginRecord {
  return {
    id: `${slug}@${OFFICIAL_MARKETPLACE_ID}`,
    name,
    description,
    categoryId,
    iconUrl: officialIcon(slug),
  };
}

/** The public marketplace roster in the store page's listing order. */
export const MOS_MARKETPLACE_PLUGINS: readonly MosMarketplacePluginRecord[] = [
  /* ---- Developer Tools ---- */
  plugin(
    'github',
    'Github',
    'GitHub CLI workflows for commits, pull requests, issues, releases, Actions, repositories, Codespaces, and other GitHub resources.',
    'developer-tools',
  ),
  plugin(
    'gitlab',
    'Gitlab',
    "GitLab CLI workflows based on GitLab's official Agent Skills for merge requests, issues, CI/CD, repositories, releases, and API operations.",
    'developer-tools',
  ),
  plugin(
    'alibaba-cloud-cli',
    'Alibaba Cloud CLI',
    'Alibaba Cloud CLI workflows for credential setup, profile checks, and safe cloud resource operations.',
    'developer-tools',
  ),
  plugin(
    'cloudbase-skills',
    'Cloudbase Skills',
    'CloudBase development skills and MCP integration for building, deploying, and troubleshooting Web, WeChat Mini Program, database, cloud function, CloudRun, storage, and AI projects.',
    'developer-tools',
  ),
  plugin(
    'code-security-protection',
    'Code Security Protection',
    'Local-first security guardrails for ZCode with pre-write hooks, end-of-turn review, Git gates, commands, a security-scan skill, and an optional MCP server for sealed deep scans.',
    'developer-tools',
  ),
  plugin(
    'agent-network',
    'AgentNetwork (anet)',
    'Delegate tasks to other AI agents over A2A through a local AgentNetwork (anet) node: find agents, send and track end-to-end encrypted tasks, settle priced skills within operator limits, and answer tasks sent to this node.',
    'developer-tools',
  ),
  plugin(
    'autoresearch',
    'Autoresearch',
    'Autonomous experiment loop for ZCode: set a goal, pick a mechanical metric, and let the agent iterate. It measures, keeps what works, reverts what doesn\u2019t, and repeats.',
    'developer-tools',
  ),
  plugin(
    'jev-decisions',
    'Jev Decisions',
    'Calibrated judgment tools for ZCode agents via the community jev-mcp server: verify claims against evidence, screen untrusted text, classify, decide, and gate task completion. Ships a skill that teaches when to reach for a judgment tool instead of answering directly.',
    'developer-tools',
  ),
  plugin(
    'jupyter-notebook',
    'Jupyter Notebook',
    'Work on Jupyter notebooks in a side panel: connect to a running Jupyter Server or start one for the workspace, and edit and run cells together with the agent.',
    'developer-tools',
  ),
  plugin(
    'kicad',
    'KiCad',
    'KiCad 10 inside the conversation: agents design 2-layer boards from a circuit spec (real KiCad libraries, auto-route, DRC, Gerber/BOM/CPL); the side panel shows the 3D render and DRC verdict; one click opens the board in the real KiCad PCB Editor and every save syncs back.',
    'developer-tools',
  ),
  plugin(
    'zcode-mcp-app-dev',
    'ZCode MCP App Dev',
    'Develop MCP Apps for ZCode with official SDKs and a small host-extension reference.',
    'developer-tools',
  ),
  /* ---- Productivity ---- */
  plugin(
    'video2code',
    'Video2code',
    "Records WebM through ZCode's built-in Browser Use WebView and converts it to MP4 with ffmpeg for video/URL replication; no Playwright or external Chromium required.",
    'productivity',
  ),
  plugin(
    'lark-cli',
    'Lark CLI',
    'Lark CLI workflows for docs, sheets, Base, calendar, messaging, and other SaaS resources with guided setup and OAuth login.',
    'productivity',
  ),
  plugin(
    'tencent-meeting-cli',
    'Tencent Meeting CLI',
    'Tencent Meeting CLI workflows with OAuth2 setup, meeting management, recordings, and attendee reports.',
    'productivity',
  ),
  plugin(
    'video-agent-kit',
    'Video Agent Kit',
    'Automated video editing toolkit: standard cloud speech transcription and synthesis, full video frame extraction and understanding, local re-inspection, timeline, preview rendering, QC, and TTS.',
    'productivity',
  ),
  plugin(
    'dingtalk-cli',
    'DingTalk CLI',
    'DingTalk Workspace CLI workflows with OAuth/device authorization, profile checks, and optional upstream Skills.',
    'productivity',
  ),
  plugin(
    'wecom-cli',
    'WeCom CLI',
    'WeCom CLI workflows for messages, docs, sheets, mail, calendar, meetings, contacts, and todos with QR authentication.',
    'productivity',
  ),
  plugin(
    'browser-use',
    'Browser Use',
    'Built-in browser automation runtime and guidance for Desktop IAB and explicitly enabled CLI-managed headless CDP: open, navigate, inspect, click, type, screenshot, record workspace WebM videos, and verify web pages and local dev targets.',
    'productivity',
  ),
  plugin(
    'cadcraft',
    'CADCraft',
    'CADCraft CAD drafting in a ZCode panel, with workspace file opening and host-mediated exports.',
    'productivity',
  ),
  plugin(
    'deckcraft',
    'DeckCraft',
    'DeckCraft presentations in a ZCode panel, with workspace file opening and host-mediated exports.',
    'productivity',
  ),
  plugin(
    'designcraft',
    'DesignCraft',
    'DesignCraft page layout in a ZCode panel, with workspace file opening and host-mediated exports.',
    'productivity',
  ),
  plugin(
    'excalidraw',
    'Excalidraw',
    'Create and edit diagrams with Excalidraw and MCP tools.',
    'productivity',
  ),
  plugin(
    'gridcraft',
    'GridCraft',
    'GridCraft spreadsheets in a ZCode panel, with workspace file opening and host-mediated exports.',
    'productivity',
  ),
  plugin(
    'libtv-cli',
    'LibTV CLI',
    'Official LibTV CLI skill for video creation canvases, workspaces, nodes, models, uploads, and generation workflows.',
    'productivity',
  ),
  plugin(
    'obsidian',
    'Obsidian',
    'Obsidian authoring skills from kepano/obsidian-skills: Obsidian Flavored Markdown notes, Bases database views, JSON Canvas boards, vault automation via Obsidian CLI, clean web extraction with Defuddle, and Knap template rendering — plus visualization skills from axtonliu/axton-obsidian-visual-skills: Mermaid and Excalidraw diagram generation and text-to-canvas layout. A setup skill verifies and installs the Obsidian CLI, defuddle, and knap.',
    'productivity',
  ),
  plugin(
    'pdfcraft',
    'PdfCraft',
    'PdfCraft PDF editing in a ZCode panel, with workspace file opening and host-mediated exports.',
    'productivity',
  ),
  plugin(
    'photocraft',
    'PhotoCraft',
    'PhotoCraft image editing in a ZCode panel, with workspace file opening and host-mediated exports.',
    'productivity',
  ),
  plugin(
    'soundcraft',
    'SoundCraft',
    'SoundCraft audio editing in a ZCode panel, with workspace file opening and host-mediated exports.',
    'productivity',
  ),
  plugin(
    'typst-workbench',
    'Typst Workbench',
    'Live-preview Typst documents in a side panel with the Typst installed on your computer: the preview updates the moment the agent saves a file, the agent checks errors, looks at rendered pages, points at places in the preview and exports PDFs, and you can send selected text to the agent together with its source location.',
    'productivity',
  ),
  plugin(
    'vectorcraft',
    'VectorCraft',
    'VectorCraft vector illustration in a ZCode panel, with workspace file opening and host-mediated exports.',
    'productivity',
  ),
  plugin(
    'wordcraft',
    'WordCraft',
    'WordCraft word processing in a ZCode panel, with workspace file opening and host-mediated exports.',
    'productivity',
  ),
  plugin(
    'zotero',
    'Zotero',
    'Work with your Zotero library in a side panel: search and read papers and your highlights, let the agent highlight evidence in PDFs, cite and keep a .bib file, and import papers, write notes and organise collections.',
    'productivity',
  ),
  /* ---- Finance ---- */
  plugin(
    'tianyancha',
    'Tianyancha',
    'MCP service for Tianyancha company information queries.',
    'finance',
  ),
  plugin(
    'wind',
    'Wind',
    'MCP services for Wind stock, global stock, index, fund, bond, economic, and document data.',
    'finance',
  ),
  plugin(
    'financial-aggregated-search',
    'Financial Aggregated Search',
    'MCP services for SEC EDGAR filing search and financial web and news search.',
    'finance',
  ),
  plugin(
    'royalflush-ifind',
    'RoyalFlush iFinD',
    'MCP services for RoyalFlush iFinD stock, global stock, index, fund, and bond data.',
    'finance',
  ),
  plugin(
    'deal-modeling',
    'Deal Modeling',
    'Transaction structuring and modeling: accretion/dilution analysis, sources and uses with pro-forma capital structure, precedent-transaction comps, and capital-raise dilution modeling for M&A, IPO, placements, and rights issues',
    'finance',
  ),
  plugin(
    'corporate-fpa',
    'Corporate FP&A',
    "Corporate finance and FP&A: management reporting off a closed ledger, rolling cash-flow forecasts, budget-versus-actual variance analysis, scenario and break-even analysis, and peer benchmarking against listed comparables",
    'finance',
  ),
  plugin(
    'accounting-reporting',
    'Accounting & Reporting',
    "Accounting close and statutory reporting off the company's own ledger: month-end close checks, ledger reconciliation to transaction-level root cause, account mapping for consolidation, and statutory statements delivered as review-ready drafts",
    'finance',
  ),
  plugin(
    'equity-research',
    'Equity Research',
    'End-to-end investment research reports, sector analysis, earnings updates, and valuation models',
    'finance',
  ),
  plugin(
    'macro-strategy',
    'Macro & Strategy',
    'Top-down macro and strategy work: macro dashboards across growth/inflation/liquidity/credit, index valuation percentiles and earnings attribution, cross-asset allocation views, and policy and industrial-plan tracking',
    'finance',
  ),
  plugin(
    'company-due-diligence',
    'Company Due Diligence',
    'Counterparty and company due diligence: structured DD reports, related-party and supply-chain mapping, and risk scans (litigation, dishonesty records, pledges, penalties) for Chinese enterprises',
    'finance',
  ),
  plugin(
    'corporate-client-acquisition',
    'Corporate Client Acquisition',
    'Corporate-banking client acquisition: prospect screening by region, industry chain, park and cluster, business-opportunity scanning, and full client portraits combining registry, relationships, opportunity signals and risk',
    'finance',
  ),
  plugin(
    'fixed-income-credit',
    'Fixed Income & Credit',
    'Fixed-income and credit research: bond profiles with valuation and duration/convexity/spread, issuer credit assessment, yield-curve and credit-spread analysis, and credit-risk watchlists for onshore bonds',
    'finance',
  ),
  plugin(
    'fund-research',
    'Fund Research',
    'Fund and fund-manager research: multi-criteria fund screening, fund and manager profiles, holdings and style analysis, and shortlist comparisons for funds, ETFs, and LOFs',
    'finance',
  ),
  plugin(
    'position-monitoring',
    'Position Monitoring',
    'Watchlist and portfolio monitoring: after-close recaps, position event alerts (announcements, pledges, lockup expiries), and intraday move attribution for A/H/US names',
    'finance',
  ),
  /* ---- Other ---- */
  plugin(
    'node-repl-host',
    'Node Repl Host',
    'Shared node_repl runtime host for ZCode official capabilities. Not user-facing: it carries no skill and appears in no marketplace listing; Browser Use and Computer Use enable it and contribute their own skills, docs and runtime assets.',
    'other',
  ),
  /* ---- 游戏/3D ---- */
  plugin(
    'blender',
    'Blender',
    'Use the official Blender CLI to install or locate Blender, model in visible desktop iterations, and inspect images before refining the same project.',
    'games-3d',
  ),
  plugin(
    'godot',
    'Godot',
    'Develop games with the official Godot CLI and show each iteration in the original desktop editor.',
    'games-3d',
  ),
  plugin(
    'hyper3d-rodin',
    'Hyper3D Rodin',
    'Turn text or reference images into 3D models, split generated models into parts, and download assets for your project.',
    'games-3d',
  ),
  plugin(
    'ruic-card',
    'Ruic Card',
    'Holographic collectible-card generator: layered artwork + Blender + Three.js, in two routes - paint the four layers from a description or reference image, or derive them from a photo you already have (rembg cutout, optional watermark removal, animation render and MP4 / WeChat-sized GIF deliverables). Outputs an interactive parallax card website plus an editable card.blend project.',
    'games-3d',
  ),
  plugin(
    'tripo-3d',
    'Tripo 3D',
    'Generate textured 3D models from text or images, add rigging and animation, simplify meshes, and export assets for games or 3D printing. Requires a mainland China Tripo account.',
    'games-3d',
  ),
  plugin(
    'unity',
    'Unity',
    'Build game scenes in Unity, edit objects and assets, write C# scripts, and run and debug gameplay prototypes.',
    'games-3d',
  ),
  plugin(
    'unreal-engine',
    'Unreal Engine',
    'Build and edit Unreal Engine levels, adjust scene actors, and create and debug Blueprint logic for game prototypes.',
    'games-3d',
  ),
];

/** Resolve a catalog plugin by id (undefined when the id names no listing). */
export function mosMarketplacePluginById(
  id: string,
): MosMarketplacePluginRecord | undefined {
  return MOS_MARKETPLACE_PLUGINS.find((entry) => entry.id === id);
}

/** The plugins of one category, listing order. */
export function mosMarketplacePluginsForCategory(
  categoryId: MosMarketplaceCategoryId,
): readonly MosMarketplacePluginRecord[] {
  return MOS_MARKETPLACE_PLUGINS.filter((entry) => entry.categoryId === categoryId);
}
