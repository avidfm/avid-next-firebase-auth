import { getIdTokenResult, onIdTokenChanged } from 'firebase/auth'
import { renderHook, act } from '@testing-library/react-hooks'
import useFirebaseUser from 'src/useFirebaseUser'
import {
  createMockFirebaseUserClientSDK,
  createMockIdTokenResult,
} from 'src/testHelpers/authUserInputs'
import createMockFetchResponse from 'src/testHelpers/createMockFetchResponse'
import { setConfig } from 'src/config'
import createMockConfig from 'src/testHelpers/createMockConfig'
import createAuthUser from 'src/createAuthUser'
import logDebug from 'src/logDebug'

jest.mock('firebase/app')
jest.mock('firebase/auth')
jest.mock('src/config')
jest.mock('src/logDebug')

beforeEach(() => {
  // `fetch` is polyfilled by Next.js.
  global.fetch = jest.fn(() => Promise.resolve(createMockFetchResponse()))

  setConfig({
    ...createMockConfig(),
    loginAPIEndpoint: 'https://example.com/api/my-login',
    logoutAPIEndpoint: 'https://example.com/api/my-logout',
  })
})

afterEach(() => {
  jest.clearAllMocks()
})

describe('useFirebaseUser', () => {
  it('returns an undefined user and initialized=false before the Firebase JS SDK has initialized', () => {
    expect.assertions(1)
    const { result } = renderHook(() => useFirebaseUser())
    expect(result.current).toEqual({
      user: undefined,
      claims: {},
      initialized: false,
      authRequestCompleted: false,
    })
  })

  it('returns the Firebase user and initialized=true after the Firebase JS SDK calls `onIdTokenChanged`', async () => {
    expect.assertions(1)

    const mockFirebaseUser = createMockFirebaseUserClientSDK()
    const mockFirebaseUserWithClaims = { ...mockFirebaseUser, claims: {} }

    let onIdTokenChangedCallback

    // Capture the onIdTokenChanged callback
    onIdTokenChanged.mockImplementation((_, callback) => {
      onIdTokenChangedCallback = callback
      return () => {} // "unsubscribe" function
    })

    // Intercept the getIdToken call
    getIdTokenResult.mockResolvedValue(mockFirebaseUserWithClaims)

    const { result } = renderHook(() => useFirebaseUser())

    await act(async () => {
      // Mock that Firebase calls onIdTokenChanged.
      await onIdTokenChangedCallback(mockFirebaseUser)
    })
    expect(result.current).toEqual({
      user: mockFirebaseUser,
      claims: {},
      initialized: true,
      authRequestCompleted: true,
    })
  })

  it('return an undefined user and initialized=true if the Firebase JS SDK calls `onIdTokenChanged` with no Firebase user', async () => {
    expect.assertions(1)

    const mockFirebaseUser = undefined // not signed in

    let onIdTokenChangedCallback

    // Capture the onIdTokenChanged callback
    onIdTokenChanged.mockImplementation((_, callback) => {
      onIdTokenChangedCallback = callback
      return () => {} // "unsubscribe" function
    })

    // Intercept the getIdToken call
    getIdTokenResult.mockResolvedValue(undefined)

    const { result } = renderHook(() => useFirebaseUser())

    await act(async () => {
      // Mock that Firebase calls onIdTokenChanged.
      await onIdTokenChangedCallback(mockFirebaseUser)
    })
    expect(result.current).toEqual({
      user: undefined,
      claims: {},
      initialized: true,
      authRequestCompleted: true,
    })
  })

  it('returns custom claims if they are present after the Firebase JS SDK calls `onIdTokenChanged`', async () => {
    expect.assertions(1)

    const mockFirebaseUser = createMockFirebaseUserClientSDK()
    const mockFirebaseUserWithClaims = {
      ...mockFirebaseUser,
      claims: {
        foo: 'bar',
        has: 'cheese',
        subscription: true,
      },
    }

    let onIdTokenChangedCallback

    // Capture the onIdTokenChanged callback
    onIdTokenChanged.mockImplementation((_, callback) => {
      onIdTokenChangedCallback = callback
      return () => {} // "unsubscribe" function
    })

    // Intercept the getIdToken call
    getIdTokenResult.mockResolvedValue(mockFirebaseUserWithClaims)

    const { result } = renderHook(() => useFirebaseUser())

    await act(async () => {
      // Mock that Firebase calls onIdTokenChanged.
      await onIdTokenChangedCallback(mockFirebaseUser)
    })
    expect(result.current).toEqual({
      user: mockFirebaseUser,
      claims: {
        foo: 'bar',
        has: 'cheese',
        subscription: true,
      },
      initialized: true,
      authRequestCompleted: true,
    })
  })

  it('calls the login endpoint as expected when the Firebase JS SDK calls `onIdTokenChanged` with an authed user value', async () => {
    expect.assertions(2)
    const mockToken = 'my-token-here'
    const mockFirebaseUser = {
      ...createMockFirebaseUserClientSDK(),
      getIdToken: async () => mockToken,
    }

    let onIdTokenChangedCallback

    // Capture the onIdTokenChanged callback
    onIdTokenChanged.mockImplementation((_, callback) => {
      onIdTokenChangedCallback = callback
      return () => {} // "unsubscribe" function
    })

    // Intercept the getIdToken call
    const idTokenResult = createMockIdTokenResult()
    getIdTokenResult.mockResolvedValue(idTokenResult)

    renderHook(() => useFirebaseUser())

    expect(fetch).not.toHaveBeenCalled()
    await act(async () => {
      await onIdTokenChangedCallback(mockFirebaseUser)
    })
    expect(fetch).toHaveBeenCalledWith(
      'https://example.com/api/my-login', // from mock config
      {
        method: 'POST',
        headers: {
          Authorization: mockToken,
        },
        credentials: 'include',
      }
    )
  })

  it('calls the logout endpoint as expected when the Firebase JS SDK calls `onIdTokenChanged` without an authed user', async () => {
    expect.assertions(2)
    let onIdTokenChangedCallback

    // Capture the onIdTokenChanged callback
    onIdTokenChanged.mockImplementation((_, callback) => {
      onIdTokenChangedCallback = callback
      return () => {} // "unsubscribe" function
    })

    const mockFirebaseUser = undefined
    renderHook(() => useFirebaseUser())

    expect(fetch).not.toHaveBeenCalled()
    await act(async () => {
      await onIdTokenChangedCallback(mockFirebaseUser)
    })
    expect(fetch).toHaveBeenCalledWith(
      'https://example.com/api/my-logout', // from mock config
      {
        method: 'POST',
        credentials: 'include',
      }
    )
  })

  it('throws if `fetch`ing the login endpoint does not return an OK response', async () => {
    expect.assertions(1)
    let onIdTokenChangedCallback

    // Capture the onIdTokenChanged callback
    onIdTokenChanged.mockImplementation((_, callback) => {
      onIdTokenChangedCallback = callback
      return () => {} // "unsubscribe" function
    })

    const idTokenResult = createMockIdTokenResult()
    getIdTokenResult.mockResolvedValue(idTokenResult)

    const mockFirebaseUser = createMockFirebaseUserClientSDK()
    renderHook(() => useFirebaseUser())

    // Mock that `fetch` returns a non-OK response.
    global.fetch.mockResolvedValue({
      ...createMockFetchResponse(),
      ok: false,
      status: 500,
    })

    await act(async () => {
      await expect(onIdTokenChangedCallback(mockFirebaseUser)).rejects.toThrow(
        'Received 500 response from login API endpoint: {}'
      )
    })
  })

  it('throws if `fetch` throws when calling the login endpoint', async () => {
    expect.assertions(1)
    let onIdTokenChangedCallback

    // Capture the onIdTokenChanged callback
    onIdTokenChanged.mockImplementation((_, callback) => {
      onIdTokenChangedCallback = callback
      return () => {} // "unsubscribe" function
    })

    const mockFirebaseUser = createMockFirebaseUserClientSDK()
    renderHook(() => useFirebaseUser())

    // Mock that `fetch` returns a non-OK response.
    global.fetch.mockRejectedValue(new Error('Could not fetch.'))

    await act(async () => {
      await expect(onIdTokenChangedCallback(mockFirebaseUser)).rejects.toThrow(
        'Could not fetch.'
      )
    })
  })

  it('throws if `fetch`ing the logout endpoint does not return an OK response', async () => {
    expect.assertions(1)
    let onIdTokenChangedCallback

    // Capture the onIdTokenChanged callback
    onIdTokenChanged.mockImplementation((_, callback) => {
      onIdTokenChangedCallback = callback
      return () => {} // "unsubscribe" function
    })

    const mockFirebaseUser = undefined
    renderHook(() => useFirebaseUser())

    // Mock that `fetch` returns a non-OK response.
    global.fetch.mockResolvedValue({
      ...createMockFetchResponse(),
      ok: false,
      status: 500,
    })

    await act(async () => {
      await expect(onIdTokenChangedCallback(mockFirebaseUser)).rejects.toThrow(
        'Received 500 response from logout API endpoint: {}'
      )
    })
  })

  it('throws if `fetch` throws when calling the logout endpoint', async () => {
    expect.assertions(1)
    let onIdTokenChangedCallback

    // Capture the onIdTokenChanged callback
    onIdTokenChanged.mockImplementation((_, callback) => {
      onIdTokenChangedCallback = callback
      return () => {} // "unsubscribe" function
    })

    const mockFirebaseUser = undefined
    renderHook(() => useFirebaseUser())

    // Mock that `fetch` returns a non-OK response.
    global.fetch.mockRejectedValue(new Error('Could not fetch.'))

    await act(async () => {
      await expect(onIdTokenChangedCallback(mockFirebaseUser)).rejects.toThrow(
        'Could not fetch.'
      )
    })
  })

  it('unsubscribes from the Firebase `onIdTokenChanged` event when it unmounts', () => {
    expect.assertions(2)
    const onIdTokenChangedUnsubscribe = jest.fn()
    onIdTokenChanged.mockImplementation(() => onIdTokenChangedUnsubscribe)
    const { unmount } = renderHook(() => useFirebaseUser())
    expect(onIdTokenChangedUnsubscribe).not.toHaveBeenCalled()
    unmount()
    expect(onIdTokenChangedUnsubscribe).toHaveBeenCalled()
  })

  it('does not modify state after it unmounts', async () => {
    expect.assertions(1)

    // If this test fails, we expect a console error from React:
    // "Warning: Can't perform a React state update on an unmounted component".
    const consoleErrorSpy = jest.spyOn(console, 'error')

    // Control when the auth fetch resolves.
    let fetchPromiseResolver
    const fetchPromise = jest.fn(
      () =>
        new Promise((resolve) => {
          fetchPromiseResolver = resolve
        })
    )
    global.fetch = fetchPromise

    const mockFirebaseUser = createMockFirebaseUserClientSDK()
    const mockFirebaseUserWithClaims = { ...mockFirebaseUser, claims: {} }

    let onIdTokenChangedCallback

    // Capture the onIdTokenChanged callback
    onIdTokenChanged.mockImplementation((_, callback) => {
      onIdTokenChangedCallback = callback
      return () => {} // "unsubscribe" function
    })

    // Intercept the getIdToken call
    getIdTokenResult.mockResolvedValue(mockFirebaseUserWithClaims)

    const { unmount } = renderHook(() => useFirebaseUser())
    await act(async () => {
      // Not awaiting.
      onIdTokenChangedCallback(mockFirebaseUser)
    })

    // Resolve the fetch after unmount.
    unmount()

    await act(async () => {
      fetchPromiseResolver(createMockFetchResponse())
    })
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('calls "tokenChangedHandler" with AuthUser if it is configured', async () => {
    expect.assertions(4)
    const tokenChangedHandler = jest.fn()
    setConfig({
      ...createMockConfig(),
      tokenChangedHandler,
    })

    const mockFirebaseUser = createMockFirebaseUserClientSDK()

    // Intercept the getIdToken call
    const idTokenResult = createMockIdTokenResult()
    getIdTokenResult.mockResolvedValue(idTokenResult)

    let onIdTokenChangedCallback

    // Capture the onIdTokenChanged callback
    onIdTokenChanged.mockImplementation((_, callback) => {
      onIdTokenChangedCallback = callback
      return () => {} // "unsubscribe" function
    })

    const mockAuthUser = createAuthUser({
      firebaseUserClientSDK: mockFirebaseUser,
      clientInitialized: true,
    })
    renderHook(() => useFirebaseUser())

    expect(fetch).not.toHaveBeenCalled()
    expect(tokenChangedHandler).not.toHaveBeenCalled()
    await act(async () => {
      await onIdTokenChangedCallback(mockFirebaseUser)
    })
    expect(fetch).not.toHaveBeenCalled()
    const authUser = {
      ...mockAuthUser,
      getIdToken: expect.any(Function),
      serialize: expect.any(Function),
      signOut: expect.any(Function),
    }
    expect(tokenChangedHandler).toHaveBeenCalledWith(authUser)
  })

  it('returns "setAuthCookieComplete=false" until the fetch in the default token changed handler resolves', async () => {
    expect.assertions(2)

    // Control when the auth fetch resolves.
    let fetchPromiseResolver
    const fetchPromise = jest.fn(
      () =>
        new Promise((resolve) => {
          fetchPromiseResolver = resolve
        })
    )
    global.fetch = fetchPromise

    const mockFirebaseUser = createMockFirebaseUserClientSDK()
    const mockFirebaseUserWithClaims = { ...mockFirebaseUser, claims: {} }

    let onIdTokenChangedCallback

    // Capture the onIdTokenChanged callback
    onIdTokenChanged.mockImplementation((_, callback) => {
      onIdTokenChangedCallback = callback
      return () => {} // "unsubscribe" function
    })

    // Intercept the getIdToken call
    getIdTokenResult.mockResolvedValue(mockFirebaseUserWithClaims)

    const { result } = renderHook(() => useFirebaseUser())

    await act(async () => {
      // Not awaited. The login `fetch` call has not resolved; that is,
      // auth cookies have not been set.
      onIdTokenChangedCallback(mockFirebaseUser)
    })
    expect(result.current).toEqual({
      user: mockFirebaseUser,
      claims: {},
      initialized: true,
      authRequestCompleted: false,
    })

    await act(async () => {
      // Resolve the login `fetch` call; that is, cookies have (most likely)
      // been set.
      fetchPromiseResolver(createMockFetchResponse())
    })
    expect(result.current).toEqual({
      user: mockFirebaseUser,
      claims: {},
      initialized: true,
      authRequestCompleted: true,
    })
  })

  it('returns "setAuthCookieComplete=false" until the fetch in the custom "tokenChangedHandler" resolves', async () => {
    expect.assertions(2)

    // Control when the tokenChangedHanlder resolves.
    let tokenChangedPromiseResolver
    const tokenChangedHandler = jest.fn(
      () =>
        new Promise((resolve) => {
          tokenChangedPromiseResolver = resolve
        })
    )

    setConfig({
      ...createMockConfig(),
      tokenChangedHandler,
    })

    const mockFirebaseUser = createMockFirebaseUserClientSDK()

    // Intercept the getIdToken call
    const idTokenResult = createMockIdTokenResult()
    getIdTokenResult.mockResolvedValue(idTokenResult)

    let onIdTokenChangedCallback

    // Capture the onIdTokenChanged callback
    onIdTokenChanged.mockImplementation((_, callback) => {
      onIdTokenChangedCallback = callback
      return () => {} // "unsubscribe" function
    })

    const { result } = renderHook(() => useFirebaseUser())

    await act(async () => {
      // Not awaited. The `tokenChangedHandler` call has not resolved; that is,
      // auth cookies have not been set.
      onIdTokenChangedCallback(mockFirebaseUser)
    })
    expect(result.current).toEqual({
      user: mockFirebaseUser,
      claims: {},
      initialized: true,
      authRequestCompleted: false,
    })

    await act(async () => {
      // Resolve the `tokenChangedHandler` call; that is, cookies have (most
      // likely) been set.
      tokenChangedPromiseResolver(createMockFetchResponse())
    })
    expect(result.current).toEqual({
      user: mockFirebaseUser,
      claims: {},
      initialized: true,
      authRequestCompleted: true,
    })
  })

  it('resets "setAuthCookieComplete" to false when the token changes again', async () => {
    expect.assertions(3)

    const mockFirebaseUser = createMockFirebaseUserClientSDK()
    const mockFirebaseUserWithClaims = { ...mockFirebaseUser, claims: {} }

    let onIdTokenChangedCallback

    // Capture the onIdTokenChanged callback
    onIdTokenChanged.mockImplementation((_, callback) => {
      onIdTokenChangedCallback = callback
      return () => {} // "unsubscribe" function
    })

    // Intercept the getIdToken call
    getIdTokenResult.mockResolvedValue(mockFirebaseUserWithClaims)

    const { result } = renderHook(() => useFirebaseUser())

    await act(async () => {
      await onIdTokenChangedCallback(mockFirebaseUser)
    })
    expect(result.current).toEqual({
      user: mockFirebaseUser,
      claims: {},
      initialized: true,
      authRequestCompleted: true,
    })

    // Control when the auth fetch resolves.
    let fetchPromiseResolver
    const fetchPromise = jest.fn(
      () =>
        new Promise((resolve) => {
          fetchPromiseResolver = resolve
        })
    )
    global.fetch = fetchPromise

    await act(async () => {
      // Not awaited. The `tokenChangedHandler` call has not resolved.
      onIdTokenChangedCallback(mockFirebaseUser)
    })
    expect(result.current).toEqual({
      user: mockFirebaseUser,
      claims: {},
      initialized: true,
      authRequestCompleted: false,
    })

    await act(async () => {
      fetchPromiseResolver(createMockFetchResponse())
    })
    expect(result.current).toEqual({
      user: mockFirebaseUser,
      claims: {},
      initialized: true,
      authRequestCompleted: true,
    })
  })

  it('logs the expected debugging messages', async () => {
    expect.assertions(5)

    let tokenChangedPromiseResolver
    const tokenChangedHandler = jest.fn(
      () =>
        new Promise((resolve) => {
          tokenChangedPromiseResolver = resolve
        })
    )
    setConfig({
      ...createMockConfig(),
      tokenChangedHandler,
    })
    const mockFirebaseUser = createMockFirebaseUserClientSDK()
    const idTokenResult = createMockIdTokenResult()
    getIdTokenResult.mockResolvedValue(idTokenResult)

    let onIdTokenChangedCallback
    // Capture the onIdTokenChanged callback
    onIdTokenChanged.mockImplementation((_, callback) => {
      onIdTokenChangedCallback = callback
      return () => {} // "unsubscribe" function
    })

    renderHook(() => useFirebaseUser())

    expect(logDebug).not.toHaveBeenCalled()

    await act(async () => {
      // Not awaited. The `tokenChangedHandler` call has not resolved; that is,
      // auth cookies have not been set.
      onIdTokenChangedCallback(mockFirebaseUser)
    })

    expect(logDebug).toHaveBeenCalledWith(
      'Firebase ID token changed. Firebase user:',
      expect.any(Object)
    )
    expect(logDebug).toHaveBeenCalledWith(
      'Starting auth API request via tokenChangedHandler.'
    )
    expect(logDebug).not.toHaveBeenCalledWith(
      'Completed auth API request via tokenChangedHandler.'
    )

    await act(async () => {
      // Resolve the `tokenChangedHandler` call; that is, cookies have (most
      // likely) been set.
      tokenChangedPromiseResolver(createMockFetchResponse())
    })

    expect(logDebug).toHaveBeenCalledWith(
      'Completed auth API request via tokenChangedHandler.'
    )
  })
})
