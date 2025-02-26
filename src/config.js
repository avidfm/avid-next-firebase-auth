import isClientSide from 'src/isClientSide'
import logDebug from 'src/logDebug'

let config

const ONE_WEEK_IN_MS = 7 * 60 * 60 * 24 * 1000
const TWO_WEEKS_IN_MS = 14 * 60 * 60 * 24 * 1000

const defaultConfig = {
  debug: false,
  // Required string: the API endpoint to call on auth state
  // change for an authenticated user.
  loginAPIEndpoint: undefined,
  // Required string: the API endpoint to call on auth state
  // change for a signed-out user.
  logoutAPIEndpoint: undefined,
  // Optional function: callback handler to call on auth state
  // changes. Replaces need for loginAPIEndpoint and logoutAPIEndpoint
  tokenChangedHandler: undefined,
  // Optional string: the URL to navigate to when the user
  // needs to log in.
  authPageURL: undefined,
  // Optional string: the URL to navigate to when the user
  // is alredy logged in but on an authentication page.
  appPageURL: undefined,
  // Optional object: the config passed to the Firebase
  // Node admin SDK's firebaseAdmin.initializeApp.
  // Not required if the app is initializing the admin SDK
  // elsewhere.
  firebaseAdminInitConfig: undefined,
  // Required object: the config passed to the Firebase
  // client JS SDK firebase.initializeApp.
  // The "firebaseClientInitConfig.apiKey" value is always
  // required, but other options are optional if the app
  // initializes the admin SDK manually.
  firebaseClientInitConfig: undefined,
  // Optional object: the firebase auth emulator host address
  // on the user's machine. Should be set to 'localhost:9099' in order
  // to match the FIREBASE_AUTH_EMULATOR_HOST variable on the server
  // see https://firebase.google.com/docs/emulator-suite/connect_auth
  firebaseAuthEmulatorHost: undefined,
  cookies: {
    // Required string. The base name for the auth cookies.
    name: undefined,
    // Required string or array.
    keys: undefined,
    // Options below are passed to cookies.set:
    // https://github.com/pillarjs/cookies#cookiesset-name--value---options--
    // We'll default to stricter, more secure options.
    domain: undefined,
    httpOnly: true,
    maxAge: ONE_WEEK_IN_MS,
    overwrite: true,
    path: '/',
    sameSite: 'strict',
    secure: true,
    signed: true,
  },
}

const validateConfig = (mergedConfig) => {
  const errorMessages = []

  if (mergedConfig.tokenChangedHandler) {
    if (mergedConfig.loginAPIEndpoint) {
      errorMessages.push(
        'The "loginAPIEndpoint" setting should not be set if you are using a "tokenChangedHandler".'
      )
    }
    if (mergedConfig.logoutAPIEndpoint) {
      errorMessages.push(
        'The "logoutAPIEndpoint" setting should not be set if you are using a "tokenChangedHandler".'
      )
    }
  } else {
    if (!mergedConfig.loginAPIEndpoint) {
      errorMessages.push('The "loginAPIEndpoint" setting is required.')
    }
    if (!mergedConfig.logoutAPIEndpoint) {
      errorMessages.push('The "logoutAPIEndpoint" setting is required.')
    }
  }

  // Require the public API key, which we use on the backend when
  // managing tokens.
  if (
    !(
      mergedConfig.firebaseClientInitConfig &&
      mergedConfig.firebaseClientInitConfig.apiKey
    )
  ) {
    errorMessages.push(
      `The "firebaseClientInitConfig.apiKey" value is required.`
    )
  }

  // make sure the host address is set correctly.
  if (
    mergedConfig.firebaseAuthEmulatorHost &&
    mergedConfig.firebaseAuthEmulatorHost.startsWith('http')
  ) {
    errorMessages.push(
      'The firebaseAuthEmulatorHost should be set without a prefix (e.g., localhost:9099)'
    )
  }

  // We consider cookie keys undefined if the keys are an empty string,
  // empty array, or array of only undefined values.
  const { keys } = mergedConfig.cookies
  const areCookieKeysDefined =
    keys &&
    keys.length &&
    (keys.filter ? keys.filter((item) => item !== undefined).length : true)

  // Validate client-side config.
  if (isClientSide()) {
    if (
      mergedConfig.firebaseAdminInitConfig &&
      mergedConfig.firebaseAdminInitConfig.credential &&
      mergedConfig.firebaseAdminInitConfig.credential.privateKey
    ) {
      errorMessages.push(
        'The "firebaseAdminInitConfig" private key setting should not be available on the client side.'
      )
    }
    if (areCookieKeysDefined) {
      errorMessages.push(
        'The "cookies.keys" setting should not be available on the client side.'
      )
    }
    // Validate server-side config.
  } else {
    if (!mergedConfig.cookies.name) {
      errorMessages.push(
        'The "cookies.name" setting is required on the server side.'
      )
    }
    if (mergedConfig.cookies.signed && !areCookieKeysDefined) {
      errorMessages.push(
        'The "cookies.keys" setting must be set if "cookies.signed" is true.'
      )
    }
    // check if the AUTH_EMULATOR_HOST_VARIABLE is set if the user has
    // set the config to use the authEmultor
    if (mergedConfig.firebaseAuthEmulatorHost) {
      if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
        errorMessages.push(
          'The "FIREBASE_AUTH_EMULATOR_HOST" environment variable should be set if you are using the "firebaseAuthEmulatorHost" option'
        )
      } else if (
        process.env.FIREBASE_AUTH_EMULATOR_HOST !==
        mergedConfig.firebaseAuthEmulatorHost
      ) {
        errorMessages.push(
          'The "FIREBASE_AUTH_EMULATOR_HOST" environment variable should be the same as the host set in the config'
        )
      }
    }
    // Limit the max cookie age to two weeks for security. This matches
    // Firebase's limit for user identity cookies:
    // https://firebase.google.com/docs/auth/admin/manage-cookies
    // By default, the cookie will be refreshed each time the user loads
    // the client-side app.
    if (mergedConfig.cookies.maxAge > TWO_WEEKS_IN_MS) {
      errorMessages.push(
        `The "cookies.maxAge" setting must be less than two weeks (${TWO_WEEKS_IN_MS} ms).`
      )
    }
  }
  return {
    isValid: errorMessages.length === 0,
    errors: errorMessages,
  }
}

// Replace private values with "hidden" for safer logging during
// debugging.
const replacePrivateValues = (unredactedConfig) => {
  const redactedConfig = {
    ...unredactedConfig,
    cookies: {
      ...unredactedConfig.cookies,
      keys: ['hidden'],
    },
    firebaseAdminInitConfig: {
      ...unredactedConfig.firebaseAdminInitConfig,
      credential: {
        ...unredactedConfig.firebaseAdminInitConfig.credential,
        privateKey: 'hidden',
        clientEmail: 'hidden',
      },
    },
  }
  return redactedConfig
}

export const setConfig = (userConfig = {}) => {
  logDebug(
    'Setting config with provided value:',
    replacePrivateValues(userConfig)
  )

  const { cookies: cookieOptions = {}, ...otherUserConfig } = userConfig

  // Merge the user's config with the default config, validate it,
  // and set it.
  const mergedConfig = {
    ...defaultConfig,
    ...otherUserConfig,
    cookies: {
      ...defaultConfig.cookies,
      ...cookieOptions,
    },
  }
  const { isValid, errors } = validateConfig(mergedConfig)
  if (!isValid) {
    throw new Error(`Invalid next-firebase-auth options: ${errors.join(' ')}`)
  }
  config = mergedConfig
}

export const getConfig = () => {
  if (!config) {
    throw new Error('next-firebase-auth must be initialized before rendering.')
  }
  return config
}
