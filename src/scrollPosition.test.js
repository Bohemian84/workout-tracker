import assert from "node:assert/strict";
import test from "node:test";
import { preserveScrollPosition } from "./scrollPosition.js";

function fixture() {
  const frames = [];
  const scrolls = [];
  const view = {
    scrollY: 1200,
    innerHeight: 844,
    visualViewport: { height: 844 },
    requestAnimationFrame: (callback) => frames.push(callback),
    scrollBy: (options) => scrolls.push(options)
  };
  const document = { defaultView: view, activeElement: null };
  const anchor = {
    ownerDocument: document,
    isConnected: true,
    top: 200,
    getBoundingClientRect() { return { top: this.top }; }
  };
  return { anchor, document, view, scrolls, flush: () => frames.splice(0).forEach((fn) => fn()) };
}

test("adding a recommendation keeps its position when no field is being edited", () => {
  const f = fixture();
  preserveScrollPosition(f.anchor, () => { f.anchor.top += 400; });
  f.flush();
  assert.deepEqual(f.scrolls, [{ top: 400, left: 0, behavior: "instant" }]);
});

test("no movement is scheduled for unchanged recommendation layout", () => {
  const f = fixture();
  preserveScrollPosition(f.anchor, () => {});
  f.flush();
  assert.deepEqual(f.scrolls, []);
});

test("updates still run without a recommendation section", () => {
  let updated = false;
  preserveScrollPosition(null, () => { updated = true; });
  assert.equal(updated, true);
});

test("editing a name, number, or range takes priority over recommendation scrolling", () => {
  for (const tag of ["input", "textarea", "select"]) {
    const f = fixture();
    f.document.activeElement = { matches: (selector) => selector.includes(tag) };
    preserveScrollPosition(f.anchor, () => { f.anchor.top += 400; });
    f.flush();
    assert.equal(f.anchor.top, 600);
    assert.deepEqual(f.scrolls, []);
  }
});

test("a pending scroll cannot pull focus away from a newly selected field", () => {
  const f = fixture();
  preserveScrollPosition(f.anchor, () => { f.anchor.top += 400; });
  f.document.activeElement = { matches: () => true };
  f.flush();
  assert.deepEqual(f.scrolls, []);
});

test("contenteditable focus also cancels a pending adjustment", () => {
  const f = fixture();
  preserveScrollPosition(f.anchor, () => { f.anchor.top += 400; });
  f.document.activeElement = { matches: () => false, isContentEditable: true };
  f.flush();
  assert.deepEqual(f.scrolls, []);
});

test("keyboard resizing cancels a pending adjustment", () => {
  const f = fixture();
  preserveScrollPosition(f.anchor, () => { f.anchor.top += 400; });
  f.view.visualViewport.height = 450;
  f.flush();
  assert.deepEqual(f.scrolls, []);
});

test("manual or browser scroll adjustments are not applied a second time", () => {
  const f = fixture();
  preserveScrollPosition(f.anchor, () => { f.anchor.top += 400; });
  f.view.scrollY += 400;
  f.flush();
  assert.deepEqual(f.scrolls, []);
});

test("removed sections do not trigger delayed scrolling", () => {
  const f = fixture();
  preserveScrollPosition(f.anchor, () => { f.anchor.top += 400; });
  f.anchor.isConnected = false;
  f.flush();
  assert.deepEqual(f.scrolls, []);
});

test("browsers without visualViewport still preserve recommendation position", () => {
  const f = fixture();
  delete f.view.visualViewport;
  preserveScrollPosition(f.anchor, () => { f.anchor.top += 400; });
  f.flush();
  assert.equal(f.scrolls.length, 1);
});
