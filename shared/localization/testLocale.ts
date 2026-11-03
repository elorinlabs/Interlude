// Existing UI fixtures assert Chinese copy. Make their locale explicit now that
// new installations follow the system language; locale-specific tests override it.
const testNavigator = globalThis.navigator ?? {};
Object.defineProperty(testNavigator, 'language', { configurable: true, get: () => 'zh-CN' });
if (!globalThis.navigator) {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: testNavigator });
}

// Ant Design's portal/scroll-lock helpers ask jsdom for pseudo-element styles.
// jsdom logs a not-implemented error for that optional argument, which makes
// otherwise deterministic tests time out when the full suite runs together.
if (typeof window !== 'undefined') {
  const nativeGetComputedStyle = window.getComputedStyle.bind(window);
  window.getComputedStyle = ((element: Element, pseudo?: string | null) => {
    if (pseudo) {
      return { content: 'none', getPropertyValue: () => '' } as unknown as CSSStyleDeclaration;
    }
    return nativeGetComputedStyle(element);
  }) as typeof window.getComputedStyle;
}
