function isEditing(element) {
  return Boolean(
    element?.matches("input, textarea, select") || element?.isContentEditable
  );
}

function getViewport(view) {
  return {
    height: view.visualViewport?.height ?? view.innerHeight,
    width: view.visualViewport?.width ?? view.innerWidth,
    offsetTop: view.visualViewport?.offsetTop ?? 0,
    scale: view.visualViewport?.scale ?? 1
  };
}

export function preserveInputPosition(input) {
  const document = input?.ownerDocument;
  const view = document?.defaultView;
  if (!view || document.activeElement !== input || !isEditing(input)) return;
  if (input.matches("select, input[type=checkbox], input[type=radio], input[type=date]")) return;

  const before = input.getBoundingClientRect();
  const viewport = getViewport(view);
  if (before.top < viewport.offsetTop || before.bottom > viewport.offsetTop + viewport.height) return;

  const scrollY = view.scrollY;
  const interactions = ["pointerdown", "touchmove", "wheel", "keydown"];
  let cancelled = false;
  const cancel = () => { cancelled = true; };
  const cleanup = () => interactions.forEach((name) => view.removeEventListener(name, cancel));
  interactions.forEach((name) => view.addEventListener(name, cancel, { passive: true }));

  // Only repair a large, off-screen jump after an edit, never normal keyboard panning or user scrolling.
  function restore() {
    if (cancelled || !input.isConnected || document.activeElement !== input) return;
    const currentViewport = getViewport(view);
    if (currentViewport.scale !== viewport.scale ||
        ["height", "width", "offsetTop"].some((key) => Math.abs(currentViewport[key] - viewport[key]) > 1)) {
      cancelled = true;
      return;
    }
    const after = input.getBoundingClientRect();
    const offscreen = after.bottom <= viewport.offsetTop || after.top >= viewport.offsetTop + viewport.height;
    if (offscreen && Math.abs(view.scrollY - scrollY) > viewport.height / 2) {
      view.scrollBy({ top: after.top - before.top, left: 0, behavior: "instant" });
    }
  }

  view.requestAnimationFrame(() => {
    restore();
    view.requestAnimationFrame(() => {
      restore();
      cleanup();
    });
  });
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
