import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, describe } from 'node:test'

const pluginEntryUrl = new URL('../index.js', import.meta.url)
const pluginEntryFile = fileURLToPath(pluginEntryUrl)
const pluginDirectory = path.dirname(pluginEntryFile)

const importPluginFromEntry = async () => {
  const url = new URL(pluginEntryUrl.href)
  url.search = `?t=${Date.now()}_${Math.random().toString(36).slice(2)}`
  return import(url.href)
}

describe('bundled extension path self-injection', () => {
  test('normalizes existing directory entry to this plugin entry file', async () => {
    const previous = process.env.GSD_BUNDLED_EXTENSION_PATHS

    try {
      process.env.GSD_BUNDLED_EXTENSION_PATHS = pluginDirectory
      await importPluginFromEntry()

      assert.deepEqual(
        process.env.GSD_BUNDLED_EXTENSION_PATHS.split(path.delimiter).filter(
          Boolean,
        ),
        [pluginEntryFile],
      )
    } finally {
      if (previous === undefined) delete process.env.GSD_BUNDLED_EXTENSION_PATHS
      else process.env.GSD_BUNDLED_EXTENSION_PATHS = previous
    }
  })

  test('does not append duplicate entry file', async () => {
    const previous = process.env.GSD_BUNDLED_EXTENSION_PATHS

    try {
      process.env.GSD_BUNDLED_EXTENSION_PATHS = pluginEntryFile
      await importPluginFromEntry()

      assert.deepEqual(
        process.env.GSD_BUNDLED_EXTENSION_PATHS.split(path.delimiter).filter(
          Boolean,
        ),
        [pluginEntryFile],
      )
    } finally {
      if (previous === undefined) delete process.env.GSD_BUNDLED_EXTENSION_PATHS
      else process.env.GSD_BUNDLED_EXTENSION_PATHS = previous
    }
  })
})
