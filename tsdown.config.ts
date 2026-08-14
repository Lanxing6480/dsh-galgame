import { clientBundle } from './build/tsdown.client.ts'

export default clientBundle('@lanxing/dsh-galgame', ['src/index.ts'], {
  portableCssModuleIds: true,
})
