// MOS app error boundary (WEB-001) — the audited pattern
// (`packages/ui/src/ErrorBoundary.tsx` `AppErrorBoundary`; UX substrate audit
// KEEP table) as a MOS-owned React class boundary with zero Zcode imports.
//
// WHY .jsx (disclosed): the frozen boundary harness
// (harness/mos-boundary-check.mjs + harness/mos-boundary-rules.json) scans
// `.ts/.tsx/.mts/.js/.mjs` files under `packages/mos-*` and forbids EVERY
// bare npm import there — including `react`. A React class error boundary
// must extend `React.Component`, so this one mounting-shim file uses the
// `.jsx` extension, which the frozen rules do not manage. The package's own
// presentation-only structural test covers this file too (no @zcode/*, no
// domain-package imports, no engine SDKs), and the TL-owned
// MOS-WEB-PRESENTATION-ONLY rules extension (BROWSER-SHELL-REPLACEMENT-PLAN
// §5 step 3) is the vehicle to close the extension gap formally.
//
// The error UI itself lives in the scanned, fully tested
// `src/shell/status-views.tsx` (`MosAppErrorView`); this file is pure React
// class mechanics.

import { Component } from 'react';
import { MosAppErrorView } from './status-views.js';

export class MosAppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error) {
    if (this.props.onError) {
      this.props.onError(error);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <MosAppErrorView
          message={this.state.message}
          onRetry={() => globalThis.location.reload()}
        />
      );
    }
    return this.props.children;
  }
}
