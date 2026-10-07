/**
 * Static render-tree helpers for the shell's component tests (UX-001).
 *
 * The MOS view components are deliberately HOOK-FREE (stateless,
 * uncontrolled forms, one route per load — see the README), so a component
 * can be exercised by CALLING it as a function and walking the returned
 * React element tree — plain objects from `react/jsx-runtime`. This walker
 * invokes nested function components, concatenates text and finds elements
 * by tag/test-id/role, giving render-level assertions without a DOM and
 * without any browser claim (full browser acceptance is UX-006).
 */

/** A rendered element node in the static tree. */
export interface RenderedElement {
  /** Tag name (string), component identity (function) or fragment symbol. */
  readonly type: unknown;
  readonly props: Record<string, unknown>;
}

function isReactElement(value: unknown): value is { type: unknown; props: Record<string, unknown> } {
  return typeof value === 'object' && value !== null && 'type' in value && 'props' in value;
}

/** Collect every element node of a static render tree (pre-order). */
export function flattenRenderTree(root: unknown): readonly RenderedElement[] {
  const out: RenderedElement[] = [];
  const visit = (value: unknown): void => {
    if (value === null || value === undefined || typeof value === 'boolean') {
      return;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    if (!isReactElement(value)) {
      return;
    }
    if (typeof value.type === 'function') {
      visit(value.type(value.props));
      return;
    }
    out.push({ type: value.type, props: value.props });
    visit(value.props.children);
  };
  visit(root);
  return out;
}

/** Concatenate all text of a static render tree (nested components invoked). */
export function renderTreeText(root: unknown): string {
  const textOf = (value: unknown): string => {
    if (value === null || value === undefined || typeof value === 'boolean') {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.map(textOf).join('');
    }
    if (isReactElement(value)) {
      if (typeof value.type === 'function') {
        return textOf(value.type(value.props));
      }
      return textOf(value.props.children);
    }
    return '';
  };
  return textOf(root);
}

/** Elements carrying the given `data-testid`. */
export function elementsWithTestId(
  root: unknown,
  testId: string,
): readonly RenderedElement[] {
  return flattenRenderTree(root).filter(
    (element) => element.props['data-testid'] === testId,
  );
}

/** First element carrying the given `data-testid`, or `null`. */
export function elementWithTestId(root: unknown, testId: string): RenderedElement | null {
  return elementsWithTestId(root, testId)[0] ?? null;
}

/** Elements with the given tag name (case-sensitive lowercase). */
export function elementsWithTag(root: unknown, tag: string): readonly RenderedElement[] {
  return flattenRenderTree(root).filter((element) => element.type === tag);
}

/** Elements carrying an explicit `role` prop with the given value. */
export function elementsWithRole(root: unknown, role: string): readonly RenderedElement[] {
  return flattenRenderTree(root).filter((element) => element.props.role === role);
}

/** Elements whose `aria-current` is set (keyboard/AT navigation pin). */
export function elementsWithAriaCurrent(root: unknown): readonly RenderedElement[] {
  return flattenRenderTree(root).filter((element) => element.props['aria-current'] !== undefined);
}

/** All link (`<a>`) hrefs in the tree, in order. */
export function linkHrefs(root: unknown): readonly string[] {
  return elementsWithTag(root, 'a').map(
    (element) => String(element.props.href ?? ''),
  );
}
