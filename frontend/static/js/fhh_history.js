// Undo/redo history of layout snapshots (person positions + annotations) and saved-state tracking.

const MAX_STEPS = 50;

let undo_stack = [];
let redo_stack = [];
let current = null;
let saved_key = null;
const listeners = [];

function key_of(snapshot) {
  return JSON.stringify(snapshot);
}

function clone(snapshot) {
  return JSON.parse(JSON.stringify(snapshot));
}

function notify() {
  for (const listener of listeners) listener();
}

export function on_change(listener) {
  listeners.push(listener);
}

export function reset(snapshot) {
  undo_stack = [];
  redo_stack = [];
  current = snapshot ? clone(snapshot) : null;
  saved_key = snapshot ? key_of(snapshot) : null;
  notify();
}

export function commit(snapshot) {
  if (current && key_of(snapshot) === key_of(current)) return false;
  if (current) {
    undo_stack.push(current);
    if (undo_stack.length > MAX_STEPS) undo_stack.shift();
  }
  current = clone(snapshot);
  redo_stack = [];
  notify();
  return true;
}

export function undo() {
  if (undo_stack.length === 0) return null;
  redo_stack.push(current);
  current = undo_stack.pop();
  notify();
  return clone(current);
}

export function redo() {
  if (redo_stack.length === 0) return null;
  undo_stack.push(current);
  current = redo_stack.pop();
  notify();
  return clone(current);
}

export function can_undo() {
  return undo_stack.length > 0;
}

export function can_redo() {
  return redo_stack.length > 0;
}

export function mark_saved() {
  saved_key = current ? key_of(current) : null;
  notify();
}

export function is_dirty() {
  return !!current && key_of(current) !== saved_key;
}
