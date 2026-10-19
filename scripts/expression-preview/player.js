/* Standalone experiment UI. The builder embeds the actual TS classifier and
 * adapter; no CDN, fetch, framework, API key, or model runtime. */
(() => {
  const { splitIntoSentences, initialExpressionState, advanceExpression } = window.ExpressionLab
  const $ = (id) => document.getElementById(id)
  const labels = { neutral: '平静', happy: '开心', thinking: '思考', surprised: '惊讶', helpless: '无奈', angry: '轻微不满', sad: '难过', shy: '目移／害羞' }
  const intents = { explain: '解释原因', report: '汇报结果', instruct: '交代操作', consider: '思索／权衡', technical: '技术内容', converse: '一般表达' }
  const root = '../../assets/characters/deepseek/'
  const assets = Object.fromEntries(Object.keys(labels).map(id => [id, id === 'happy' ? root + 'portraits/neutral.webp' : root + 'portraits/expressions-v1/' + id + '.webp']))
  let source = ORIGINAL_SAMPLE
  let units = splitIntoSentences(source)
  let unitIndex = 0, visible = 0, playing = false, timer = null
  let state = initialExpressionState(), events = [], lastImage = '', imageVersion = 0, activeImage = 0
  let lastVisibleText = '', lastHistory = ''
  const imageNodes = [$('portrait-a'), $('portrait-b')]
  imageNodes[0].src = assets.neutral
  Object.values(assets).forEach(src => { const img = new Image(); img.src = src })

  // A small safe Markdown view for this experiment. All user text is inserted
  // as text nodes; no raw HTML or links from pasted input are executed.
  function inline(parent, text) {
    const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g
    let cursor = 0
    for (const match of text.matchAll(pattern)) {
      parent.append(document.createTextNode(text.slice(cursor, match.index)))
      const el = document.createElement(match[0].startsWith('`') ? 'code' : 'strong')
      el.textContent = match[0].startsWith('`') ? match[0].slice(1, -1) : match[0].slice(2, -2)
      parent.append(el)
      cursor = match.index + match[0].length
    }
    parent.append(document.createTextNode(text.slice(cursor)))
  }
  function markdown(text) {
    const frag = document.createDocumentFragment()
    let code = null
    for (const line of text.split('\n')) {
      if (/^\s*(```|~~~)/.test(line)) {
        if (code) code = null
        else { const pre = document.createElement('pre'); code = document.createElement('code'); pre.append(code); frag.append(pre) }
        continue
      }
      if (code) { code.append(document.createTextNode(line + '\n')); continue }
      const heading = /^#{1,6}\s+/.test(line)
      const el = document.createElement(heading ? 'h3' : /^\s*>/.test(line) ? 'blockquote' : 'p')
      if (/^\s*([-*+]\s|\d+[.)]\s)/.test(line)) el.className = 'list'
      inline(el, line.replace(/^#{1,6}\s+|^\s*>\s?/, '').replace(/&#x20;/gi, ' '))
      frag.append(el)
    }
    return frag
  }
  function feed(index, count) {
    const result = advanceExpression(state, { unitKey: `preview:${index}`, visibleText: units[index].slice(0, count), complete: count === units[index].length })
    state = result.state
    if (result.event) events.push({ unit: index + 1, offset: count, ...result.event })
  }
  function simulate(index, count) {
    // Evaluate at the same punctuation boundaries used in streaming, never at
    // the full future paragraph. This makes manual navigation reproducible.
    const text = units[index].slice(0, count)
    let last = 0
    for (const m of text.matchAll(/[。！？!?；;\n]|——|……/g)) {
      last = m.index + m[0].length
      feed(index, last)
    }
    if (last !== count || count === units[index].length) feed(index, count)
  }
  function seek(index, count = units[index]?.length ?? 0) {
    pause()
    unitIndex = Math.max(0, Math.min(index, units.length - 1))
    visible = count
    state = initialExpressionState(); events = []
    for (let i = 0; i < unitIndex; i++) simulate(i, units[i].length)
    simulate(unitIndex, visible)
    render()
  }
  function portrait(id) {
    if (id === lastImage) return
    lastImage = id
    $('portrait-label').textContent = labels[id]
    const version = ++imageVersion
    const nextIndex = 1 - activeImage
    const next = imageNodes[nextIndex]
    next.onload = () => {
      if (version !== imageVersion) return
      imageNodes[activeImage].classList.remove('visible')
      imageNodes[activeImage].setAttribute('aria-hidden', 'true')
      next.classList.add('visible'); next.removeAttribute('aria-hidden')
      activeImage = nextIndex
    }
    next.onerror = () => { if (version === imageVersion) $('status').textContent = `未能加载 ${labels[id]} 图片，请检查候选素材目录。` }
    next.alt = `鲸鱼娘 · ${labels[id]}`
    next.src = assets[id]
  }
  function render() {
    const text = units[unitIndex]?.slice(0, visible) ?? ''
    if (text !== lastVisibleText) {
      const scroller = $('dialogue')
      const follow = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 50
      scroller.replaceChildren(markdown(text || '点击播放，查看表情如何跟随文字变化。'))
      if (follow) scroller.scrollTop = scroller.scrollHeight
      lastVisibleText = text
    }
    portrait(state.portrait)
    $('position').textContent = `${visible} / ${units[unitIndex]?.length ?? 0} 字`
    $('unit-count').textContent = `${unitIndex + 1} / ${units.length}`
    $('switch-count').textContent = String(events.length)
    $('progress').max = units[unitIndex]?.length || 1
    $('progress').value = visible
    $('intent').textContent = `表达功能 · ${intents[state.decision.intent]}`
    $('decision').textContent = labels[state.portrait]
    $('reason').textContent = state.evaluatedText ? state.decision.reason : '等待当前可见短句形成；文字继续显示，立绘保持。'
    $('evidence').textContent = state.decision.evidence.length ? state.decision.evidence.map(e => `${labels[e.portrait]} +${e.weight}  「${e.phrase}」`).join('\n') : '没有足够的情绪证据，不强行换脸。'
    $('ignored').replaceChildren(...state.decision.ignored.map(s => { const span = document.createElement('span'); span.textContent = s; return span }))
    const historySignature = JSON.stringify(events)
    if (historySignature !== lastHistory) {
      lastHistory = historySignature
      $('history').replaceChildren(...events.map(e => {
        const li = document.createElement('li'), button = document.createElement('button'), small = document.createElement('small')
        button.className = 'timeline-button'
        button.textContent = `第 ${e.unit} 段 · ${labels[e.from]} → ${labels[e.to]}`
        button.onclick = () => seek(e.unit - 1, e.offset)
        small.textContent = `第 ${e.offset} 字 · ${e.reason}`
        li.append(button, small); return li
      }))
      if (!events.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = '还没有发生切换'; $('history').append(li) }
    }
    $('prev').disabled = unitIndex === 0
    $('next').disabled = unitIndex === units.length - 1
    $('play').textContent = playing ? '暂停' : '播放'
    $('reveal').disabled = visible === (units[unitIndex]?.length ?? 0)
  }
  function pause() { playing = false; clearTimeout(timer); timer = null }
  function tick() {
    if (!playing) return
    const length = units[unitIndex].length
    if (visible === length) {
      if (unitIndex === units.length - 1) { pause(); render(); return }
      unitIndex++; visible = 0
    }
    const target = Math.min(units[unitIndex].length, visible + Math.max(1, Math.round(Number($('speed').value) / 20)))
    // Keep decision offsets independent of playback speed/chunk size.
    for (let n = visible + 1; n <= target; n++) feed(unitIndex, n)
    visible = target
    render()
    timer = setTimeout(tick, visible === units[unitIndex].length ? 1100 : 50)
  }
  function play() { if (playing) return; playing = true; render(); timer = setTimeout(tick, 50) }
  function load(text) {
    const next = splitIntoSentences(text)
    if (!next.length) { $('status').textContent = '请先输入一段回复。'; return }
    if (text.length > 12000) { $('status').textContent = '试验页每次最多 12000 字，请选取一条回复。'; return }
    pause(); source = text; units = next; $('source').value = text; $('status').textContent = ''; seek(0, 0)
  }
  $('play').onclick = () => { if (playing) { pause(); render() } else { if (unitIndex === units.length - 1 && visible === units[unitIndex].length) seek(0, 0); play() } }
  $('restart').onclick = () => { seek(0, 0); play() }
  $('prev').onclick = () => seek(unitIndex - 1)
  $('next').onclick = () => seek(unitIndex + 1)
  $('reveal').onclick = () => seek(unitIndex)
  $('background').onclick = () => $('stage').classList.toggle('light')
  $('apply').onclick = () => { load($('source').value); if ($('source').value.trim() && !$('status').textContent) play() }
  $('original').onclick = () => { load(ORIGINAL_SAMPLE); seek(0) }
  $('edge-cases').onclick = () => {
    load('日志显示迁移失败，历史会话打不开，14 个修不了。\n\n害羞表情的实现步骤如下。\n\n她说：“我有点生气！”\n\n我没有生气。\n\n（移开视线）那个……不是我吃的。\n\n你别这么夸我。\n\n根因是接口版本变化。\n\n终于解决了！\n\n让我想想，有两种可能。\n\n（摊开双手）真拿你没办法。\n\n我有点生气。\n\n我有点失落。')
    play()
  }
  $('export').onclick = () => {
    const blob = new Blob([JSON.stringify({ schema: 1, source, unitIndex, visible, events, current: state }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob), a = document.createElement('a')
    a.href = url; a.download = 'expression-replay.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  window.addEventListener('pagehide', pause)
  load(source)
  seek(0)
})()
