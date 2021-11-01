/* eslint-disable global-require */
import index from 'src/index'

// These are exclusively for server-side use.
import setAuthCookies from 'src/setAuthCookies'
import unsetAuthCookies from 'src/unsetAuthCookies'
import withAuthUserTokenSSRModule from 'src/withAuthUserTokenSSR'
import { verifyIdToken } from 'src/firebaseAdmin'

import initFirebaseAdminSDK from 'src/initFirebaseAdminSDK'

const initServer = (config) => {
  const clientInit = index.init(config)
  // We only initialize the Firebase admin SDK as it's needed. See:
  // https://github.com/gladly-team/next-firebase-auth/issues/70
  return clientInit
}

const withAuthUserTokenSSR = (options) =>
  withAuthUserTokenSSRModule(options, { useToken: true })

const withAuthUserSSR = (options) =>
  withAuthUserTokenSSRModule(options, { useToken: false })

const withAuthUserSSREmailVerified = (options) => withAuthUserTokenSSRModule(options, { emailVerified: true, useToken: false })

const withAuthUserTokenSSREmailVerified = (options) =>
  withAuthUserTokenSSRModule(options, { useToken: true, emailVerified: true })

const getFirebaseAdmin = () => initFirebaseAdminSDK()

export default {
  ...index,
  init: initServer,
  withAuthUserSSR,
  withAuthUserSSREmailVerified,
  withAuthUserTokenSSR,
  withAuthUserTokenSSREmailVerified,
  setAuthCookies,
  unsetAuthCookies,
  verifyIdToken,
  getFirebaseAdmin,
}
