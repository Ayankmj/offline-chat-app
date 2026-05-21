export const AccessibilityRoles = {
  button: 'button',
  link: 'link',
  search: 'search',
  image: 'image',
  keyboardKey: 'keyboardKey',
  text: 'text',
  adjustable: 'adjustable',
  summary: 'summary',
  header: 'header',
} as const;

export const AccessibilityStates = {
  selected: 'selected',
  disabled: 'disabled',
  busy: 'busy',
  checked: 'checked',
  unchecked: 'unchecked',
  off: 'off',
  on: 'on',
} as const;

export const AccessibilityTraits = {
  button: 'button',
  link: 'link',
  header: 'header',
  search: 'search',
  image: 'image',
  selected: 'selected',
  plays: 'plays',
  key: 'key',
  text: 'text',
  summary: 'summary',
  disabled: 'disabled',
  frequentUpdates: 'frequentUpdates',
  startsMedia: 'startsMedia',
  adjustable: 'adjustable',
  allowsDirectInteraction: 'allowsDirectInteraction',
  pageTurn: 'pageTurn',
} as const;

export const AccessibilityActions = {
  tap: 'tap',
  longpress: 'longpress',
  dismiss: 'dismiss',
  increment: 'increment',
  decrement: 'decrement',
} as const;
