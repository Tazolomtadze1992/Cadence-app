'use client'

import * as React from 'react'
import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
} from 'next-themes'

/**
 * Wrapper for `next-themes`. The app currently configures the provider in
 * `app/layout.tsx` (forced dark mode). Use this file again if you consolidate
 * theme setup or re-enable the light/dark toggle.
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
