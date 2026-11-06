const assert = require("node:assert/strict");
const { before, beforeEach, test } = require("node:test");

let history;

before(async () => {
  history = await import("./fhh_history.js");
});

const state = (x) => ({ positions: { a: { x, y: 0 } }, lines: [], arrows: [], texts: [] });

beforeEach(() => {
  history.reset(state(0));
});

test("a fresh history is clean with nothing to undo or redo", () => {
  assert.equal(history.is_dirty(), false);
  assert.equal(history.can_undo(), false);
  assert.equal(history.can_redo(), false);
});

test("committing an unchanged snapshot is ignored", () => {
  assert.equal(history.commit(state(0)), false);
  assert.equal(history.can_undo(), false);
});

test("undo and redo walk back and forth through snapshots", () => {
  history.commit(state(1));
  history.commit(state(2));

  assert.deepEqual(history.undo(), state(1));
  assert.deepEqual(history.undo(), state(0));
  assert.equal(history.undo(), null);
  assert.deepEqual(history.redo(), state(1));
  assert.deepEqual(history.redo(), state(2));
  assert.equal(history.redo(), null);
});

test("a new change clears the redo stack", () => {
  history.commit(state(1));
  history.undo();
  assert.equal(history.can_redo(), true);

  history.commit(state(5));
  assert.equal(history.can_redo(), false);
});

test("history is capped at 50 steps", () => {
  for (let i = 1; i <= 60; i++) history.commit(state(i));
  let steps = 0;
  while (history.undo()) steps++;
  assert.equal(steps, 50);
});

test("dirty tracks the saved snapshot, including undoing back to it", () => {
  history.commit(state(1));
  assert.equal(history.is_dirty(), true);

  history.mark_saved();
  assert.equal(history.is_dirty(), false);

  history.commit(state(2));
  assert.equal(history.is_dirty(), true);
  history.undo();
  assert.equal(history.is_dirty(), false);
});

test("returned snapshots are copies", () => {
  history.commit(state(1));
  const snapshot = history.undo();
  snapshot.positions.a.x = 99;
  assert.deepEqual(history.redo(), state(1));
  assert.deepEqual(history.undo(), state(0));
});
