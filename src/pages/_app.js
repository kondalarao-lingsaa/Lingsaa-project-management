import 'react-perfect-scrollbar/dist/css/styles.css'
import 'src/styles/globals.css'
import Head from 'next/head'
import { Toaster } from 'react-hot-toast'
import PmsAppShell from 'src/pms/standalone/PmsAppShell'
import { PmsSettingsProvider } from 'src/pms/standalone/PmsSettings'
import StoreProvider from 'src/redux-store/StoreProvider'

// STANDALONE ONLY - Lingsaa_Accounts has its own _app.js (do not copy this file at merge time).
// StoreProvider/pmsApi and PmsSettingsProvider stand in for the root app's store and theme settings.
const App = ({ Component, pageProps }) => (
  <StoreProvider>
    <Head>
      <title>LINGSAA PMS</title>
      <meta name='viewport' content='width=device-width, initial-scale=1' />
    </Head>
    <PmsSettingsProvider>
      <Toaster position='top-right' />
      {Component.noShell ? (
        <Component {...pageProps} />
      ) : (
        <PmsAppShell>
          <Component {...pageProps} />
        </PmsAppShell>
      )}
    </PmsSettingsProvider>
  </StoreProvider>
)

export default App
