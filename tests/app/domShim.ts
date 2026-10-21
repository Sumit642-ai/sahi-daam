/**
 * Test-only: React Router's data router builds a `Request` with an
 * AbortSignal. Under jsdom that signal is jsdom's, which Node's own `Request`
 * rejects ("Expected signal to be an instance of AbortSignal"), so every
 * navigation fails silently. The app has no loaders or actions, so the signal
 * is never read; dropping it here changes nothing the tests check.
 */
import { configure } from '@testing-library/react'

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

/**
 * Screens are lazy routes. The first import of one under jsdom transforms the
 * module on the spot, which on a busy machine (every test file in parallel)
 * can take longer than Testing Library's 1 s default for findBy / waitFor.
 */
configure({ asyncUtilTimeout: 5_000 })
