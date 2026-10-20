/**
 * Test-only: React Router's data router builds a `Request` with an
 * AbortSignal. Under jsdom that signal is jsdom's, which Node's own `Request`
 * rejects ("Expected signal to be an instance of AbortSignal"), so every
 * navigation fails silently. The app has no loaders or actions, so the signal
 * is never read; dropping it here changes nothing the tests check.
 */
const NodeRequest = globalThis.Request

class TestRequest extends NodeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    if (init?.signal) {
      const { signal: _signal, ...rest } = init
      super(input, rest)
    } else {
      super(input, init)
    }
  }
}

globalThis.Request = TestRequest as typeof Request
