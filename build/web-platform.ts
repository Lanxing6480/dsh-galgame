/**
 * Shared browser platform modules. Seeding, bundling externals, and the client
 * bundle's purity gate consume this list so their module identities cannot
 * drift from the shell's frozen seed table.
 *
 * Mirrors the Web shell's `__DSH_BOOT__` platform table for dsh 0.2.0-rc.2:
 * React, Cordis, the snapshot Store engine (promoted out of the former
 * `dsh-client-runtime/client` exemption), the slot registry, the primitives
 * library, and dockkit. Anything NOT listed here must be inlined by the client
 * bundle, because the browser module table cannot answer its require.
 * @module @lanxing/dsh-galgame/build/web-platform
 */

/** The module specifiers the shell shares into the frozen module table. */
export const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
] as const

/** One platform module specifier (a seed-table key). */
export type PlatformModule = (typeof PLATFORM_MODULES)[number]
