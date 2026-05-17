// Evil entry — should NEVER be imported under B4-SEC enforcement.
// If the loader executes this file the test fails because it sets a
// global flag the test inspects.
globalThis.__SHERPA_TEST_EVIL_LOADED__ = true;
export function initialize() {
  return Promise.resolve();
}
export function capabilities() {
  return [{ kind: 'language' }];
}
