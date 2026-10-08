// Tiny indirection so views can switch tabs without importing main.js (avoids circular imports).
let handler = () => {};
export const setNavigator = (fn) => { handler = fn; };
export const goto = (view) => handler(view);
