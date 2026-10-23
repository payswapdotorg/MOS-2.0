import type { TenantScope } from '@mos/contracts';
import type { CreateMissionIntentDeclaration } from '../ports/mission-catalog.js';
import type { ConsoleIntentDeclaration, ConsoleIntentLedgerRecord } from '../ports/console-intents.js';
import type { LabIntentDeclaration, LabIntentLedgerRecord } from '../ports/lab-intents.js';
import type { DeclareMissionIntentOutcome } from '../routes/intent-declaration.js';
import type { ComposerActionEntry } from './composer-bridge.js';
import type { ComposerActionId } from './composer-actions.js';
import { COMPOSER_ACTIONS_BY_ID } from './composer-actions.js';
import { missionIntentDeclarationFromFormData } from '../views/mission-intent-form-data.js';

/**
 * The composer's PURE state machine (the §6 P0 universal-composer wave —
 * UXR-WC). No React, no DOM, no ports: the entries own one
 * {@link ComposerUiState} value and fold {@link ComposerUiEvent}s through
 * {@link composerReducer}, exactly like the shell's read models arrive as
 * props — the presentation-only discipline the package's hook-free
 * component idiom already enforces.
 *
 * The composer NEVER executes: the `confirm` event is consumed by the ENTRY
 * (the only place with the shell callbacks), which turns the current state
 * into a {@link ComposerConfirmPlan} via {@link composerConfirmPlan} — a
 * declaration built by the EXISTING form parsers over the SAME field names,
 * routed to the SAME onDeclare* callback family — and folds the authority's
 * outcome back in as an `outcome` event.
 */

/** The authority verdict the receipt card renders (never fabricated). */
export type ComposerOutcomeView =
  | { readonly kind: 'mission'; readonly outcome: DeclareMissionIntentOutcome }
  | { readonly kind: 'console'; readonly record: ConsoleIntentLedgerRecord }
  | { readonly kind: 'lab'; readonly record: LabIntentLedgerRecord }
  | { readonly kind: 'refused'; readonly code: string; readonly message: string };

/** Where the composer flow currently is. */
export type ComposerPhase =
  | { readonly kind: 'pick' }
  | { readonly kind: 'clarify'; readonly stepIndex: number }
  | { readonly kind: 'summary' }
  | { readonly kind: 'waiting' }
  | { readonly kind: 'result'; readonly outcome: ComposerOutcomeView };

/** The composer's whole UI state (a plain value; the entry owns it). */
export interface ComposerUiState {
  /** Whether the overlay is mounted (closing preserves the rest). */
  readonly open: boolean;
  /** The action-aware entry that opened the composer, when one did. */
  readonly entry: ComposerActionEntry | null;
  /** The chosen/preloaded action, or `null` while picking. */
  readonly actionId: ComposerActionId | null;
  /** Controlled field values keyed by the shared form-field names. */
  readonly values: Readonly<Record<string, string>>;
  readonly phase: ComposerPhase;
}

/** Every UI event the composer chrome emits (props-in, events-out). */
export type ComposerUiEvent =
  | { readonly kind: 'toggle' }
  | { readonly kind: 'open'; readonly entry: ComposerActionEntry | null }
  | { readonly kind: 'dismiss' }
  | { readonly kind: 'pick-action'; readonly actionId: ComposerActionId }
  | { readonly kind: 'field-change'; readonly name: string; readonly value: string }
  | { readonly kind: 'advance' }
  | { readonly kind: 'back' }
  | { readonly kind: 'confirm' }
  | { readonly kind: 'declared' }
  | { readonly kind: 'refused'; readonly code: string; readonly message: string }
  | { readonly kind: 'outcome'; readonly outcome: ComposerOutcomeView }
  | { readonly kind: 'restart' };

/** The initial state: closed, on the picker, with nothing in flight. */
export function initialComposerState(): ComposerUiState {
  return { open: false, entry: null, actionId: null, values: {}, phase: { kind: 'pick' } };
}

/** Field values with the catalog's declared defaults applied. */
function initialValuesFor(actionId: ComposerActionId): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of COMPOSER_ACTIONS_BY_ID[actionId].fields) {
    values[field.name] = field.defaultValue ?? '';
  }
  return values;
}

/** Start an action: reset the values to the catalog defaults, clarify at 0. */
function startAction(state: ComposerUiState, actionId: ComposerActionId): ComposerUiState {
  return {
    open: true,
    entry: state.entry,
    actionId,
    values: initialValuesFor(actionId),
    phase: { kind: 'clarify', stepIndex: 0 },
  };
}

/**
 * Fold one UI event. Pure. `confirm` is deliberately a NO-OP here: the
 * entry consumes it (only the entry can route the declaration through the
 * shell callbacks); a `confirm` reaching this reducer means no entry
 * intercepted it, and refusing to act is the honest behavior.
 */
export function composerReducer(state: ComposerUiState, event: ComposerUiEvent): ComposerUiState {
  switch (event.kind) {
    case 'toggle': {
      return { ...state, open: !state.open };
    }
    case 'open': {
      if (event.entry === null) {
        return { ...state, open: true };
      }
      if (state.actionId === event.entry.actionId && state.phase.kind !== 'pick') {
        // Same action already in flight: just re-open where it stands.
        return { ...state, open: true, entry: event.entry };
      }
      return { ...startAction(state, event.entry.actionId), entry: event.entry };
    }
    case 'dismiss': {
      return { ...state, open: false };
    }
    case 'pick-action': {
      return startAction(state, event.actionId);
    }
    case 'field-change': {
      if (state.phase.kind !== 'clarify' && state.phase.kind !== 'summary') {
        return state;
      }
      return { ...state, values: { ...state.values, [event.name]: event.value } };
    }
    case 'advance': {
      if (state.phase.kind !== 'clarify' || state.actionId === null) {
        return state;
      }
      const fields = COMPOSER_ACTIONS_BY_ID[state.actionId].fields;
      const field = fields[state.phase.stepIndex];
      if (field === undefined) {
        return state;
      }
      if (field.required && (state.values[field.name] ?? '').trim() === '') {
        // Defense in depth behind the disabled Next control: a required
        // field never advances while empty — the composer refuses to guess.
        return state;
      }
      const next = state.phase.stepIndex + 1;
      return next < fields.length
        ? { ...state, phase: { kind: 'clarify', stepIndex: next } }
        : { ...state, phase: { kind: 'summary' } };
    }
    case 'back': {
      if (state.phase.kind === 'summary' && state.actionId !== null) {
        return {
          ...state,
          phase: {
            kind: 'clarify',
            stepIndex: Math.max(0, COMPOSER_ACTIONS_BY_ID[state.actionId].fields.length - 1),
          },
        };
      }
      if (state.phase.kind === 'clarify') {
        return state.phase.stepIndex > 0
          ? { ...state, phase: { kind: 'clarify', stepIndex: state.phase.stepIndex - 1 } }
          : { ...state, phase: { kind: 'pick' }, actionId: null, values: {} };
      }
      return state;
    }
    case 'confirm': {
      // Consumed by the entry (see composerConfirmPlan); a no-op here.
      return state;
    }
    case 'declared': {
      return { ...state, phase: { kind: 'waiting' } };
    }
    case 'refused': {
      return {
        ...state,
        phase: { kind: 'result', outcome: { kind: 'refused', code: event.code, message: event.message } },
      };
    }
    case 'outcome': {
      return { ...state, phase: { kind: 'result', outcome: event.outcome } };
    }
    case 'restart': {
      return { ...state, actionId: null, values: {}, phase: { kind: 'pick' } };
    }
  }
}

/** Any declaration the composer may hand a shell callback. */
export type ComposerDeclaration =
  | CreateMissionIntentDeclaration
  | ConsoleIntentDeclaration
  | LabIntentDeclaration;

/** What the entry does with a `confirm` event (the plan is pure). */
export interface ComposerConfirmPlan {
  /** The event to fold BEFORE calling the callback (`refused` instead of `declared`). */
  readonly followUp:
    | { readonly kind: 'declared' }
    | { readonly kind: 'refused'; readonly code: string; readonly message: string };
  /** The declaration to route, when the composer fields carried one. */
  readonly declaration: ComposerDeclaration | null;
  /** Which shell callback family the declaration leaves through. */
  readonly declareRoute: 'mission' | 'console' | 'lab' | null;
}

const NO_TENANT = {
  code: 'composer-no-tenant-context',
  message:
    'no tenant context is resolved — the create-mission declaration needs one; the shell refuses to guess',
} as const;

/**
 * Build the confirm plan for the current state: fold the controlled values
 * into a FormData over the SHARED field names and run the EXISTING parser
 * for the action — the exact same declaration the dedicated intent form
 * submits. A parser refusal (or a missing tenant scope for mission
 * declarations) becomes the plan's named refusal — never a guessed
 * declaration.
 */
export function composerConfirmPlan(
  state: ComposerUiState,
  scope: TenantScope | null,
): ComposerConfirmPlan {
  if (state.actionId === null) {
    return {
      followUp: {
        kind: 'refused',
        code: 'composer-no-action',
        message: 'no action is selected — the composer has nothing to declare',
      },
      declaration: null,
      declareRoute: null,
    };
  }
  const action = COMPOSER_ACTIONS_BY_ID[state.actionId];
  if (action.declareRoute === 'mission' && scope === null) {
    return { followUp: { kind: 'refused', ...NO_TENANT }, declaration: null, declareRoute: null };
  }
  const form = new FormData();
  for (const field of action.fields) {
    form.set(field.name, state.values[field.name] ?? field.defaultValue ?? '');
  }
  if (action.declareRoute === 'mission') {
    const declaration = missionIntentDeclarationFromFormData(form, scope as TenantScope);
    if ('error' in declaration) {
      return {
        followUp: {
          kind: 'refused',
          code: declaration.error,
          message: 'the composer fields did not carry a complete create-mission declaration',
        },
        declaration: null,
        declareRoute: null,
      };
    }
    return { followUp: { kind: 'declared' }, declaration, declareRoute: 'mission' };
  }
  const parsed = action.parse !== undefined ? action.parse(form) : null;
  if (parsed === null || !parsed.ok) {
    const failure = parsed !== null && !parsed.ok ? parsed : null;
    return {
      followUp: {
        kind: 'refused',
        code: failure !== null ? failure.code : 'composer-no-parser',
        message:
          failure !== null
            ? failure.message
            : 'the action has no declared parser — the composer refuses to guess',
      },
      declaration: null,
      declareRoute: null,
    };
  }
  return {
    followUp: { kind: 'declared' },
    declaration: parsed.declaration,
    declareRoute: action.declareRoute,
  };
}
