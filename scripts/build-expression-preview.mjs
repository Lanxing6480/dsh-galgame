import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { fileURLToPath } from 'node:url'
import { splitIntoSentences } from '../src/client/adapter.ts'
import { advanceExpression, initialExpressionState } from '../src/client/expressionDirector.ts'

const base = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, base), 'utf8')
const [classifier, adapter, template, player, sample] = await Promise.all([
  read('src/client/expressionDirector.ts'), read('src/client/adapter.ts'),
  read('scripts/expression-preview/template.html'), read('scripts/expression-preview/player.js'),
  read('test/fixtures/expression-work-report.md'),
])
const toScript = (source) => stripTypeScriptTypes(source).replace(/^export /gm, '')
const engine = `window.ExpressionLab = (() => {\n${toScript(classifier)}\n${toScript(adapter)}\nreturn { splitIntoSentences, classifyExpression, initialExpressionState, advanceExpression };\n})();`
const html = template.replace('/*__ENGINE__*/', () => engine.replace(/<\/script/gi, '<\\/script'))
  .replace('/*__SAMPLE__*/', () => JSON.stringify(sample).replace(/</g, '\\u003c'))
  .replace('/*__PLAYER__*/', () => player.replace(/<\/script/gi, '<\\/script'))
const directory = new URL('docs/expression-preview/', base)
await mkdir(directory, { recursive: true })
await writeFile(new URL('index.html', directory), html)

const units = splitIntoSentences(sample)
let state = initialExpressionState()
const events = []
const start = performance.now()
for (let u = 0; u < units.length; u++) {
  for (let n = 1; n <= units[u].length; n++) {
    const result = advanceExpression(state, { unitKey: `preview:${u}`, visibleText: units[u].slice(0, n), complete: n === units[u].length })
    state = result.state
    if (result.event) events.push({ unit: u + 1, offset: n, ...result.event })
  }
}
const report = { source: 'test/fixtures/expression-work-report.md', characters: sample.length, units: units.length, events, elapsedMs: Math.round((performance.now() - start) * 100) / 100, note: 'Single local Node run of all visible prefixes, excluding UI/images. Not a browser latency or semantic accuracy benchmark.' }
await writeFile(new URL('sample-trace.json', directory), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ preview: fileURLToPath(new URL('index.html', directory)), ...report }, null, 2))
