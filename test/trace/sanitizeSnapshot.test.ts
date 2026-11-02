import fs from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'
import {
  SNAPSHOT_CSP,
  sanitizeSnapshot
} from '../../src/renderer/src/foundation/trace/sanitizeSnapshot'

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'trace-v1', 'unzipped', 'steps', '0002.html')

const FORBIDDEN_TAGS = [
  'script',
  'noscript',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'base',
  'link',
  'template',
  'foreignobject',
  'animate',
  'set'
]
const ALWAYS_DROPPED = ['srcdoc', 'action', 'formaction', 'srcset', 'target', 'ping']
const URL_ATTRS = ['href', 'src', 'poster', 'background', 'data', 'cite', 'longdesc', 'lowsrc']

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

const normalise = (value: string): string => value.replace(/[\s\x00-\x1f\x7f]/g, '').toLowerCase()

// The invariants every output must hold, whatever went in.
function expectClean(out: string): Document {
  expect(out.startsWith('<!DOCTYPE html>')).toBe(true)
  const doc = parse(out)
  const first = doc.head.firstElementChild
  expect(first?.localName).toBe('meta')
  expect(first?.getAttribute('http-equiv')).toBe('Content-Security-Policy')
  expect(first?.getAttribute('content')).toBe(SNAPSHOT_CSP)
  expect(doc.querySelectorAll('meta')).toHaveLength(1)

  const elements = Array.from(doc.getElementsByTagName('*'))
  for (const el of elements) {
    expect(FORBIDDEN_TAGS).not.toContain(el.localName.toLowerCase())
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      const local = name.split(':').pop() ?? name
      expect(local.startsWith('on'), `${el.localName}[${name}]`).toBe(false)
      expect(ALWAYS_DROPPED).not.toContain(local)
      if (URL_ATTRS.includes(local)) {
        const v = normalise(attr.value)
        expect(v.startsWith('data:image/') || v.startsWith('#'), `${name}=${attr.value}`).toBe(true)
      }
      if (el.localName === 'a' || el.localName === 'area') expect(local).not.toBe('href')
    }
  }

  const css = Array.from(doc.getElementsByTagName('style'))
    .map((s) => s.textContent ?? '')
    .concat(elements.map((el) => el.getAttribute('style') ?? ''))
    .join('\n')
    .toLowerCase()
  expect(css).not.toContain('@import')
  expect(css).not.toContain('expression(')
  expect(css).not.toContain('<')
  for (const m of css.matchAll(/url\(\s*['"]?([^'")]*)/g)) {
    expect(m[1].startsWith('data:image/') || m[1].startsWith('#'), m[0]).toBe(true)
  }
  return doc
}

describe('sanitizeSnapshot', () => {
  it('keeps the fixture page', () => {
    const out = sanitizeSnapshot(fs.readFileSync(FIXTURE, 'utf8'))
    const doc = expectClean(out)
    expect(doc.querySelector('h1#title')?.textContent).toBe('Trace')
    expect(doc.querySelector('style')?.textContent).toBe('#title { color: rgb(1, 2, 3); }')
    expect(doc.title).toBe('Trace e2e')
    expect(doc.querySelectorAll('input')).toHaveLength(3)
  })

  it('removes dangerous elements', () => {
    const out = sanitizeSnapshot(`<html><head>
      <base href="https://evil.example/">
      <meta http-equiv="refresh" content="0;url=https://evil.example/">
      <META HTTP-EQUIV="Refresh" CONTENT="0">
      <meta http-equiv="set-cookie" content="a=b">
      <meta charset="utf-8">
      <link rel="stylesheet" href="https://evil.example/a.css">
      <script>alert(1)</script><SCRIPT>alert(2)</SCRIPT>
      </head><body>
      <svg><script>alert(3)</script></svg>
      <iframe src="https://evil.example/"></iframe>
      <frame src="x"><object data="x"></object><embed src="x"><applet code="x"></applet>
      <noscript><p>hidden</p></noscript>
      <template><img src=x onerror=alert(4)></template>
      <p id="keep">kept</p>
      </body></html>`)
    const doc = expectClean(out)
    expect(doc.getElementById('keep')?.textContent).toBe('kept')
    expect(out).not.toContain('alert')
    expect(out).not.toContain('evil.example')
    expect(out).not.toContain('hidden')
  })

  it('removes event handlers', () => {
    const out = sanitizeSnapshot(
      '<body ONLOAD="x()"><div id="d" onclick="x()" onmouseover="x()" class="c">t</div></body>'
    )
    const doc = expectClean(out)
    const div = doc.getElementById('d')
    expect(div?.getAttribute('class')).toBe('c')
    expect(div?.attributes).toHaveLength(2)
    expect(doc.body.attributes).toHaveLength(0)
  })

  it('removes script URLs', () => {
    const out = sanitizeSnapshot(`
      <a id="a1" href="javascript:x">one</a>
      <a id="a2" href="  JaVaScRiPt:x">two</a>
      <a id="a3" href="jav&#x09;ascript:x">three</a>
      <img id="i1" src="vbscript:x">
      <form id="f1" action="javascript:x"><button id="b1" formaction="javascript:x">go</button></form>
      <svg><a id="s1" xlink:href="javascript:x"><text>s</text></a></svg>
      <iframe srcdoc="<p>x</p>"></iframe><div id="d1" srcdoc="anything"></div>
      <img id="i2" srcset="javascript:x 1x">`)
    const doc = expectClean(out)
    for (const id of ['a1', 'a2', 'a3'])
      expect(doc.getElementById(id)?.hasAttribute('href')).toBe(false)
    expect(doc.getElementById('a3')?.textContent).toBe('three')
    expect(doc.getElementById('i1')?.hasAttribute('src')).toBe(false)
    expect(doc.getElementById('f1')?.hasAttribute('action')).toBe(false)
    expect(doc.getElementById('b1')?.hasAttribute('formaction')).toBe(false)
    expect(doc.getElementById('s1')?.attributes).toHaveLength(1)
    expect(doc.getElementById('d1')?.hasAttribute('srcdoc')).toBe(false)
    expect(doc.getElementById('i2')?.hasAttribute('srcset')).toBe(false)
    expect(out.toLowerCase()).not.toMatch(/javascript|vbscript/)
  })

  // The brief kept plain https hrefs (the frame guard blocks them); the
  // dispatch asks for every link to be neutralised, text kept.
  it('neutralises links but keeps their text', () => {
    const out = sanitizeSnapshot(
      '<a id="a" href="https://example.com/" target="_blank" ping="https://x/">Home</a>' +
        '<map><area id="m" href="https://example.com/"></map>'
    )
    const doc = expectClean(out)
    expect(doc.getElementById('a')?.textContent).toBe('Home')
    expect(doc.getElementById('a')?.attributes).toHaveLength(1)
    expect(doc.getElementById('m')?.hasAttribute('href')).toBe(false)
  })

  it('keeps data images and fragment references, drops other resource URLs', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo='
    const out = sanitizeSnapshot(`
      <img id="ok" src="${png}" alt="pic">
      <img id="remote" src="https://evil.example/t.gif">
      <img id="rel" src="/tracker.gif">
      <img id="html" src="data:text/html,<script>x</script>">
      <video id="v" poster="https://evil.example/p.jpg" src="https://evil.example/v.mp4"></video>
      <table id="t" background="https://evil.example/b.png"></table>
      <svg><use id="u" href="#icon"></use><image id="si" href="https://evil.example/i.png"></image></svg>`)
    const doc = expectClean(out)
    expect(doc.getElementById('ok')?.getAttribute('src')).toBe(png)
    expect(doc.getElementById('ok')?.getAttribute('alt')).toBe('pic')
    for (const id of ['remote', 'rel', 'html'])
      expect(doc.getElementById(id)?.hasAttribute('src')).toBe(false)
    expect(doc.getElementById('v')?.attributes).toHaveLength(1)
    expect(doc.getElementById('t')?.hasAttribute('background')).toBe(false)
    expect(doc.getElementById('u')?.getAttribute('href')).toBe('#icon')
    expect(doc.getElementById('si')?.hasAttribute('href')).toBe(false)
    expect(out).not.toContain('evil.example')
  })

  it('blanks secret field values', () => {
    const out = sanitizeSnapshot(`
      <input id="p1" type="password" value="s3cret">
      <input id="p2" type="PASSWORD" value="s3cret">
      <input id="p3" autocomplete="current-password" value="s3cret">
      <input id="p4" autocomplete="new-password" value="s3cret">
      <input id="ok" value="ok">`)
    const doc = expectClean(out)
    for (const id of ['p1', 'p2', 'p3', 'p4'])
      expect(doc.getElementById(id)?.hasAttribute('value')).toBe(false)
    expect(doc.getElementById('ok')?.getAttribute('value')).toBe('ok')
    expect(out).not.toContain('s3cret')
  })

  it('survives garbage', () => {
    for (const input of [
      '',
      '<<<>',
      '\u0000',
      '</html></body><head>',
      '<!DOCTYPE html><!DOCTYPE html>'
    ]) {
      const doc = expectClean(sanitizeSnapshot(input))
      expect(doc.documentElement.localName).toBe('html')
    }
  })

  describe('CSS', () => {
    it('keeps ordinary rules, icon escapes and data images', () => {
      const css =
        '.i::before { content: "\\f101"; } .b { background: url("data:image/png;base64,AA==") } a > b { color: red }'
      const doc = expectClean(sanitizeSnapshot(`<style>${css}</style><p style="color: red">x</p>`))
      expect(doc.querySelector('style')?.textContent).toBe(css)
      expect(doc.querySelector('p')?.getAttribute('style')).toBe('color: red')
    })

    it.each([
      ['remote url', '.a { background: url(https://evil.example/a.png) }'],
      ['quoted url', ".a { background: url('https://evil.example/a.png') }"],
      ['escaped url name', '.a { background: u\\72l(https://evil.example/a.png) }'],
      ['escaped url name 2', '.a { background: \\75 rl(https://evil.example/a.png) }'],
      ['uppercase url', '.a { background: URL(https://evil.example/a.png) }'],
      ['commented url', '.a { background: url/**/(https://evil.example/a.png) }'],
      ['import string', '@import "https://evil.example/a.css"; .a { color: red }'],
      ['import url', '@import url(https://evil.example/a.css); .a { color: red }'],
      ['escaped import', '@\\69mport "https://evil.example/a.css"; .a { color: red }'],
      ['font-face', '@font-face { font-family: x; src: url(https://evil.example/f.woff) }'],
      ['image-set', '.a { background: image-set("https://evil.example/a.png" 1x) }'],
      ['expression', '.a { width: expression(alert(1)) }'],
      ['style breakout', '.a { color: red } </style><img src=x onerror=alert(1)>']
    ])('neutralises %s in <style> and style=""', (_name, css) => {
      const out = sanitizeSnapshot(`<style>${css}</style><svg><style>${css}</style></svg>`)
      expectClean(out)
      expect(out).not.toContain('evil.example')
      expect(out).not.toContain('alert(1)')
      const attr = sanitizeSnapshot(`<p style='${css.replace(/'/g, '"')}'>x</p>`)
      expectClean(attr)
      expect(attr).not.toContain('evil.example')
    })

    it('neutralises remote urls in SVG presentation attributes, keeps fragments', () => {
      const doc = expectClean(
        sanitizeSnapshot(
          '<svg><rect id="r" fill="url(https://evil.example/#g)" stroke="url(#g)"></rect></svg>'
        )
      )
      expect(doc.getElementById('r')?.getAttribute('fill')).not.toContain('evil')
      expect(doc.getElementById('r')?.getAttribute('stroke')).toBe('url(#g)')
    })
  })

  // Shapes that rely on the page being parsed differently the second time.
  describe('mXSS corpus', () => {
    it.each([
      ['comment close trick', '<!--><img src=x onerror=alert(1)>-->'],
      ['bang comment', '<!--!><img src=x onerror=alert(1)>--!>'],
      ['comment in attribute', '<p title="<!--"><img src=x onerror=alert(1)>-->"></p>'],
      [
        'noscript title',
        '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>'
      ],
      ['noscript in head', '<head><noscript><img src=x onerror=alert(1)></noscript></head>'],
      ['noscript in svg', '<svg><noscript><img src=x onerror=alert(1)></noscript></svg>'],
      ['svg style', '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>"></style></svg>'],
      ['svg style plain', '<svg><style><img src=x onerror=alert(1)></style></svg>'],
      [
        'math mglyph',
        '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)></style></mglyph></table></mtext></math>'
      ],
      [
        'math style breakout',
        '<math><mtext><h1><a><h6></a></h6><mglyph><svg><mtext><style><a title="</style><img src onerror=alert(1)>"></style></svg></mglyph></h1></mtext></math>'
      ],
      ['math href', '<math href="javascript:alert(1)"><mi>x</mi></math>'],
      [
        'svg foreignObject',
        '<svg><foreignObject><img src=x onerror=alert(1)></foreignObject></svg>'
      ],
      [
        'svg animate',
        '<svg><a><animate attributeName="href" values="javascript:alert(1)"/><text>x</text></a></svg>'
      ],
      ['svg set', '<svg><a><set attributeName="href" to="javascript:alert(1)"/></a></svg>'],
      ['svg onload', '<svg onload=alert(1)><circle onclick=alert(1) /></svg>'],
      [
        'template nesting',
        '<template><template><img src=x onerror=alert(1)></template></template>'
      ],
      ['textarea breakout', '<textarea></textarea><img src=x onerror=alert(1)></textarea>'],
      ['xmp title', '<xmp><p title="</xmp><img src=x onerror=alert(1)>"></xmp>'],
      ['slash separated attrs', '<img/src="x"/onerror=alert(1)>'],
      ['quote-named attr', '<img """ src=x onerror=alert(1)>'],
      ['newline in attr name', '<img src=x\nonerror=alert(1)>'],
      ['uppercase handler', '<IMG SRC=x OnErRoR=alert(1)>'],
      [
        'prefixed handler',
        '<svg><a xlink:onclick="alert(1)" xml:onload="alert(1)"><text>x</text></a></svg>'
      ],
      [
        'duplicate attrs',
        '<img src="data:image/png;base64,AA==" src="javascript:alert(1)" onerror=alert(1)>'
      ],
      [
        'entity scheme',
        '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">x</a>'
      ],
      ['newline scheme', '<img src="java\nscript:alert(1)">'],
      ['nul scheme', '<img src="java\u0000script:alert(1)">'],
      [
        'form in table',
        '<table><form action="javascript:alert(1)"><tr><td><button formaction="javascript:alert(1)">x</button></td></tr></form></table>'
      ],
      ['select style', '<select><style><img src=x onerror=alert(1)></style></select>'],
      ['plaintext', '<plaintext><img src=x onerror=alert(1)>'],
      ['nested frameset', '<frameset><frame src="javascript:alert(1)"></frameset>'],
      [
        'meta in body',
        '<body><meta http-equiv="refresh" content="0;url=javascript:alert(1)"></body>'
      ],
      ['base in body', '<body><base href="javascript:alert(1)//"></body>']
    ])('%s', (_name, html) => {
      const out = sanitizeSnapshot(html)
      // expectClean checks the parsed result: what is left of the payload may
      // survive only as inert text, e.g. inside a title attribute.
      const doc = expectClean(out)
      // Sanitising the output again changes nothing: the round trip is stable.
      expect(sanitizeSnapshot(out)).toBe(out)
      expect(doc.documentElement).toBeTruthy()
    })
  })

  describe('size caps', () => {
    it('refuses input over the cap', () => {
      const out = sanitizeSnapshot('<p>x</p>' + 'a'.repeat(200), {
        maxInputChars: 100,
        maxOutputChars: 1000
      })
      const doc = expectClean(out)
      expect(doc.body.textContent).toBe('')
    })

    it('refuses output over the cap', () => {
      const out = sanitizeSnapshot('&'.repeat(90), { maxInputChars: 100, maxOutputChars: 300 })
      const doc = expectClean(out)
      expect(doc.body.textContent).toBe('')
    })

    it('keeps a page within both caps', () => {
      const out = sanitizeSnapshot('<p>hello</p>', { maxInputChars: 100, maxOutputChars: 1000 })
      expect(expectClean(out).body.textContent).toBe('hello')
    })
  })
})
