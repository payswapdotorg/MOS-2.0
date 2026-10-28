/**
 * The MOS AGENT SETTINGS form drafts (W38 — pure state, no JSX).
 *
 * The three form states the Agent Settings hub's write sections compose
 * (MCP server / user command / hook), their initializers, and the
 * record→form mappers. The ENTRY owns every draft (the hook-free law);
 * this module is the shared vocabulary so the entry, the section, and
 * the tests hold one truth. Pure module: no imports, no state.
 */

import type {
  MosWorkspaceHook,
  MosWorkspaceMcpServer,
  MosWorkspaceUserCommand,
} from './workspace-records.js';

/** The MCP server form draft (create when editingId is null). */
export interface MosMcpFormState {
  readonly editingId: string | null;
  readonly name: string;
  readonly storageLevel: 'user' | 'workspace';
  readonly type: 'stdio' | 'http' | 'sse';
  readonly command: string;
  readonly args: string;
  readonly envJson: string;
  readonly url: string;
  readonly headersJson: string;
  readonly timeoutMs: string;
  readonly protocolVersion: string;
}

export function initialMosMcpFormState(): MosMcpFormState {
  return {
    editingId: null,
    name: '',
    storageLevel: 'user',
    type: 'stdio',
    command: '',
    args: '',
    envJson: '',
    url: '',
    headersJson: '',
    timeoutMs: '',
    protocolVersion: '',
  };
}

export function mosMcpFormFromServer(record: MosWorkspaceMcpServer): MosMcpFormState {
  return {
    editingId: record.id,
    name: record.name,
    storageLevel: record.storageLevel,
    type: record.type === 'stdio' || record.type === 'http' || record.type === 'sse' ? record.type : 'http',
    command: record.command,
    args: record.args.join(' '),
    envJson: record.envJson,
    url: record.url,
    headersJson: record.headersJson,
    timeoutMs: record.timeoutMs === null ? '' : String(record.timeoutMs),
    protocolVersion: record.protocolVersion,
  };
}

/** The user command form draft (create when editingId is null). */
export interface MosCommandFormState {
  readonly editingId: string | null;
  readonly name: string;
  readonly description: string;
  readonly argumentHint: string;
  readonly prompt: string;
}

export function initialMosCommandFormState(): MosCommandFormState {
  return { editingId: null, name: '', description: '', argumentHint: '', prompt: '' };
}

export function mosCommandFormFromCommand(record: MosWorkspaceUserCommand): MosCommandFormState {
  return {
    editingId: record.id,
    name: record.name,
    description: record.description,
    argumentHint: record.argumentHint,
    prompt: record.prompt,
  };
}

/** The hook form draft (create when editingId is null). */
export interface MosHookFormState {
  readonly editingId: string | null;
  readonly event: string;
  readonly matcher: string;
  readonly type: 'command' | 'process';
  readonly command: string;
  readonly timeoutSeconds: string;
}

export function initialMosHookFormState(): MosHookFormState {
  return { editingId: null, event: 'PreToolUse', matcher: '', type: 'command', command: '', timeoutSeconds: '' };
}

export function mosHookFormFromHook(record: MosWorkspaceHook): MosHookFormState {
  return {
    editingId: record.id,
    event: record.event,
    matcher: record.matcher,
    type: record.type,
    command: record.command,
    timeoutSeconds: record.timeoutSeconds === null ? '' : String(record.timeoutSeconds),
  };
}
