import type { IsolateDriver } from '@tanstack/ai-code-mode'

export type IsolateVM = 'node' | 'quickjs'

const driverCache = new Map<IsolateVM, IsolateDriver>()

export async function createIsolateDriver(
  vm: IsolateVM = 'node',
): Promise<IsolateDriver> {
  const cached = driverCache.get(vm)
  if (cached) return cached

  let driver: IsolateDriver

  switch (vm) {
    case 'quickjs': {
      const { createQuickJSIsolateDriver } =
        await import('@tanstack/ai-isolate-quickjs')
      driver = createQuickJSIsolateDriver()
      break
    }
    case 'node':
    default: {
      try {
        const { createNodeIsolateDriver } =
          await import('@tanstack/ai-isolate-node')
        driver = createNodeIsolateDriver()
      } catch {
        console.warn(
          '[createIsolateDriver] Node isolate unavailable, using QuickJS',
        )
        const { createQuickJSIsolateDriver } =
          await import('@tanstack/ai-isolate-quickjs')
        driver = createQuickJSIsolateDriver()
      }
      break
    }
  }

  driverCache.set(vm, driver)
  return driver
}
