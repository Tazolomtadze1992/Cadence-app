import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

/** next-themes localStorage key — keep in sync with ThemeProvider `storageKey`. */
const THEME_STORAGE_KEY = 'theme'

export const metadata: Metadata = {
  title: 'Cadence - Productivity & Calendar App',
  description: 'A premium productivity app for managing tasks and calendar',
}

export const viewport: Viewport = {
  // Single dark bar color — light mode UI is temporarily disabled app-wide.
  themeColor: '#1a1a1a',
}

/**
 * Runs before paint so the first frame is never light mode. Also overwrites any
 * previously saved `light` preference. Re-enable light mode later by removing
 * `forcedTheme`, the script, and restoring the theme toggle.
 */
const forceDarkBeforeHydrationScript = `
(function(){
  try {
    var d = document.documentElement;
    d.classList.remove('light');
    d.classList.add('dark');
    localStorage.setItem(${JSON.stringify(THEME_STORAGE_KEY)}, 'dark');
  } catch (e) {}
})();`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: forceDarkBeforeHydrationScript }} />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          forcedTheme="dark"
          storageKey={THEME_STORAGE_KEY}
        >
          {children}
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
