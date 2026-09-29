import StoreProvider from '@/redux-store/StoreProvider'

import './globals.css'

export const metadata = {
  title: 'LINGSAA PMS',
  description: 'LINGSAA Property Management System'
}

export default function RootLayout({ children }) {
  return (
    <html lang='en'>
      <body>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  )
}
