/**
 * The CONNECTIONS section (the concept-exact page): the four-across
 * provider catalogue (YouTube as the PRIMARY card with "Connect YouTube";
 * the others "Explore setup"), the two-lane setup panel — the SECURE
 * PROVIDER SETUP lane (the expected-domain pill, the credentials law
 * checkrows, "Continue securely", the honesty line) and the SETUP-DRAFT
 * rail (the five steps with their security boundary) — the embedded
 * agent guidance, the concept disclaimer, and the pinned connection
 * lifecycle contracts. Presentation-only, hook-free.
 */

import type { MosConsoleSectionRecord } from '../console-nav.js';
import { MOS_PROVIDER_CATALOGUE, type MosWorkspaceSnapshot } from '../workspace-store.js';
import { ConsoleCard, ConsoleEmptyState, HonestyLine, ReceiptLine, ReferenceCard, SectionScaffold, StatusPill } from './shared.js';

const CREDENTIALS_LAW = [
  'Credentials are entered only on the provider\'s own domain (the expected-domain pill names it).',
  'MOS never asks for a provider password in this console.',
  'MOS never stores provider credentials — the connection handshake is provider-hosted.',
  'A connection grants only the scopes the provider surfaces at consent; MOS renders what was granted, never more.',
];

const SETUP_RAIL_STEPS = [
  { label: '1. Choose the provider', hint: 'The catalogue card names the surface and the expected domain.' },
  { label: '2. Open the provider\'s own onboarding', hint: 'The secure lane opens the provider-hosted page — YouTube-hosted onboarding, not a MOS credential form.' },
  { label: '3. Complete the provider handshake', hint: 'Consent happens on the provider\'s domain, under their session.' },
  { label: '4. MOS records the connection', hint: 'The workspace records the account state the transport reports — never more.' },
  { label: '5. The channel appears with its honest state', hint: 'Social and Ads render the connected state; capability verdicts stay in the matrix.' },
];

export interface ConnectionsSectionProps {
  readonly section: MosConsoleSectionRecord;
  readonly workspace: MosWorkspaceSnapshot;
  /** "Connect YouTube" / "Explore setup" — records the setup request honestly. */
  readonly onConnect: (providerId: string) => void;
  /** The most recent connection receipt. */
  readonly receipt: string | null;
}

export function ConnectionsSection({ section, workspace, onConnect, receipt }: ConnectionsSectionProps) {
  const primary = MOS_PROVIDER_CATALOGUE[0] ?? null;
  const catalogue = MOS_PROVIDER_CATALOGUE.slice(0, 4);
  if (primary === null) {
    return (
      <SectionScaffold section={section}>
        <ConsoleEmptyState
          title="The provider catalogue is empty"
          description="The catalogue is a frozen constant — an empty read is a defect, never an invented provider."
        />
      </SectionScaffold>
    );
  }
  const primaryAccount = workspace.accounts.find((entry) => entry.providerId === primary.id);
  return (
    <SectionScaffold section={section} headerAside={<StatusPill tone="unknown">{workspace.accounts.length} setup records</StatusPill>}>
      <div className="mosc-provider-grid" role="list" aria-label="Provider catalogue">
        {catalogue.map((provider) => {
          const isPrimary = provider.id === primary.id;
          const account = workspace.accounts.find((entry) => entry.providerId === provider.id);
          return (
            <article
              key={provider.id}
              role="listitem"
              className={isPrimary ? 'mosc-provider-card mosc-provider-card--primary' : 'mosc-provider-card'}
              data-testid={`mosc-provider-${provider.id}`}
            >
              <div className="mosc-provider-head">
                <h2 className="mosc-provider-name">{provider.name}</h2>
                {account === undefined ? (
                  <StatusPill tone="neutral">not connected</StatusPill>
                ) : (
                  <StatusPill tone="attention">{account.status}</StatusPill>
                )}
              </div>
              <p className="mosc-provider-line">{provider.line}</p>
              <p className="mosc-provider-domain">
                Expected domain: <code>{provider.expectedDomain}</code>
              </p>
              <button
                type="button"
                className={isPrimary ? 'mosc-button mosc-button--primary' : 'mosc-button mosc-button--ghost'}
                data-testid={`mosc-connect-${provider.id}`}
                onClick={() => onConnect(provider.id)}
              >
                {isPrimary ? 'Connect YouTube' : 'Explore setup'}
              </button>
            </article>
          );
        })}
      </div>
      <p className="mosc-registry-meta mosc-registry-meta--dim">
        Registry note: the full catalogue carries 8 providers (5 social + 3 ad platforms) — {MOS_PROVIDER_CATALOGUE.length}{' '}
        entries; the cards above are the leading four, the catalogue below the rest.
      </p>
      {receipt !== null ? <ReceiptLine tone="attention">{receipt}</ReceiptLine> : null}
      <HonestyLine>
        Setup requests record SETUP_REQUIRED — an honest state, not a connection. This release binds no OAuth transport; a
        record here never claims a live account.
      </HonestyLine>

      <div className="mosc-two-lane">
        <ConsoleCard
          id="mosc-connections-secure-lane"
          title="Secure provider setup"
          note="The lane every connection walks. The pill below names the ONLY domain where credentials may ever be entered."
        >
          <p className="mosc-domain-pill">
            <span className="mosc-domain-pill-label">Expected domain</span>
            <code>{primary.expectedDomain}</code>
          </p>
          <p className="mosc-card-note">
            YouTube-hosted onboarding: the handshake opens on {primary.expectedDomain}, under the provider's own session. MOS
            never renders a credential form for this provider.
          </p>
          <ul className="mosc-law-list">
            {CREDENTIALS_LAW.map((law) => (
              <li key={law} className="mosc-law-row">
                {law}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mosc-button mosc-button--primary"
            data-testid="mosc-continue-securely"
            onClick={() => onConnect(primary.id)}
          >
            Continue securely
          </button>
          <HonestyLine>
            "Continue securely" records the setup request and opens the provider-hosted onboarding when a transport exists — in
            this release it records the request honestly and nothing more.
          </HonestyLine>
          {primaryAccount !== undefined ? (
            <p className="mosc-line" data-testid="mosc-primary-account-state">
              YouTube: {primaryAccount.status} — recorded in this workspace, awaiting the transport.
            </p>
          ) : null}
        </ConsoleCard>

        <ConsoleCard
          id="mosc-connections-rail"
          title="Setup draft rail"
          note="The five steps a connection walks, with the security boundary made explicit at every step."
        >
          <ol className="mosc-rail-list">
            {SETUP_RAIL_STEPS.map((step) => (
              <li key={step.label} className="mosc-rail-step">
                <span className="mosc-rail-step-label">{step.label}</span>
                <span className="mosc-rail-step-hint">{step.hint}</span>
              </li>
            ))}
          </ol>
          <p className="mosc-honesty-line">
            Security boundary: the provider's domain is where consent lives; MOS's workspace is where the RECORD lives. The two
            never share a credential.
          </p>
        </ConsoleCard>
      </div>

      <ConsoleCard
        id="mosc-connections-agent"
        title="The embedded MOS agent"
        note="What the agent will do with a connected channel — and what it never does."
      >
        <ul className="mosc-law-list">
          <li className="mosc-law-row">With a connected channel, the agent composes, schedules, and reports through the workspace records.</li>
          <li className="mosc-law-row">It never auto-publishes — publishing is an arm-gated decision.</li>
          <li className="mosc-law-row">It never enters credentials — the secure lane is provider-hosted.</li>
          <li className="mosc-law-row">It answers UNKNOWN when asked about a capability it has no verdict for.</li>
        </ul>
      </ConsoleCard>

      <p className="mosc-concept-disclaimer" data-testid="mosc-concept-disclaimer">
        Concept disclosure: the setup lanes describe the production connection model this product is building toward. The
        workspace records, the capability matrix, and the arm gate are real; the live OAuth handshake awaits the production
        transport.
      </p>

      <ReferenceCard
        id="mosc-connections-contracts"
        title="Connection lifecycle contracts"
        note="The typed states a provider connection walks — the vocabulary this workspace records."
        terms={[
          { term: 'NOT_CONNECTED', line: 'No setup record exists — the catalogue card is the honest surface.' },
          { term: 'SETUP_REQUIRED', line: 'A setup request is recorded; the provider handshake awaits the transport.' },
          { term: 'CONNECTED', line: 'The transport reports a live account — only a real handshake ever sets this.' },
          { term: 'REVOKED', line: 'The operator ended the connection; the workspace records the revocation verbatim.' },
        ]}
      />
    </SectionScaffold>
  );
}
