import 'src/styles/globals.css'
import Head from 'next/head'
import PmsAppShell from 'src/pms/standalone/PmsAppShell'

// STANDALONE ONLY - Lingsaa_Accounts has its own _app.js (do not copy this file at merge time).
const App = ({ Component, pageProps }) => (
  <>
    <Head>
      <title>LINGSAA PMS</title>
    </Head>
    <PmsAppShell>
      <Component {...pageProps} />
    </PmsAppShell>
  </>
)

export default App
