function isEditing(element) {
  return Boolean(
    element?.matches("input, textarea, select") || element?.isContentEditable
  );
}

export function preserveScrollPosition(anchor, update) {
  const document = anchor?.ownerDocument;
  const view = document?.defaultView;
  const previousTop = anchor?.getBoundingClientRect().top;
  const previousScrollY = view?.scrollY;
  const previousHeight = view?.visualViewport?.height ?? view?.innerHeight;
  const wasEditing = isEditing(document?.activeElement);

  update();

  if (!view || !anchor.isConnected || wasEditing) return;

  view.requestAnimationFrame(() => {
    // Keyboard/focus changes and manual scrolling take priority over keeping a suggestion in place.
    if (
      !anchor.isConnected ||
      isEditing(document.activeElement) ||
      view.scrollY !== previousScrollY ||
      (view.visualViewport?.height ?? view.innerHeight) !== previousHeight
    ) return;

    const delta = anchor.getBoundingClientRect().top - previousTop;
    if (Math.abs(delta) > 1) {
      view.scrollBy({ top: delta, left: 0, behavior: "instant" });
    }
  });
}
