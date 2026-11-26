export type TabNavigationWebContents = {
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  isDestroyed: () => boolean;
};

export function getTabNavigationState(contents: TabNavigationWebContents | null | undefined) {
  if (!contents || contents.isDestroyed()) return { canGoBack: false, canGoForward: false };
  return { canGoBack: contents.canGoBack(), canGoForward: contents.canGoForward() };
}
