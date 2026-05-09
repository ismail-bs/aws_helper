// Central event bus for the app.
// The client requested:
//   "Everywhere we click on a button we dispatch an event and we use the event
//    listeners to trigger flows".
//
// Components emit named events via `dispatch(name, detail)`; handlers listen
// via `listen(name, fn)`. We intentionally do NOT import any React state from
// here so utils stay framework-agnostic and unit-testable.

const target = new EventTarget();

export function dispatch(name, detail) {
  target.dispatchEvent(new CustomEvent(name, { detail }));
}

export function listen(name, fn) {
  const wrapped = (e) => fn(e.detail, e);
  target.addEventListener(name, wrapped);
  return () => target.removeEventListener(name, wrapped);
}

export function listenMany(map) {
  const offs = Object.entries(map).map(([n, fn]) => listen(n, fn));
  return () => offs.forEach((off) => off());
}
