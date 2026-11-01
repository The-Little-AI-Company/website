/**
 * Self-tests for the helpers under tests/helpers. If a helper is wrong, every suite built on
 * it is wrong, so these cover the edges: formats, entities, minified CSS, color literals.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { colorLiteralsInCss, colorLiteralsInSource, colorLiteralsInValue, contrast, luminance, parseHex, toRgbString } from '../helpers/color';
import {
  allCapsWords,
  bannedWords,
  currency,
  dates,
  emDashes,
  emoji,
  exclamations,
  firstPersonPlural,
  retiredNames,
  semicolons,
  titleCaseWords,
} from '../helpers/copy';
import {
  allBlocks,
  breakpoints,
  darkRootVariables,
  declarations,
  fontFamilies,
  inside,
  isForcedColors,
  isReducedMotion,
  normalizeHex,
  normalizeValue,
  parseCss,
  rootVariables,
  stripComments,
} from '../helpers/css';
import { documentOrder, focusables, inOrder, one, all } from '../helpers/dom';
import { PAGES, PUBLIC, fragmentsIn, listFiles, parseHtml, resolveSitePath, splitHref, srcsetUrls } from '../helpers/dist';
import { decodePng, encodePng, pixelAt, readPngSize, readWebp } from '../helpers/image';
import { altTexts, collapse, textBlocks, textOf, visibleText } from '../helpers/text';
import { COLOR_NAMES, loadTokens, themeColor } from '../helpers/tokens';

const text = (html: string): string => visibleText(parseHtml(html));

describe('color: contrast', () => {
  it('is 21 for black on white', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 6);
  });

  it('is 21 for the 3-digit forms too', () => {
    expect(contrast('#000', '#fff')).toBeCloseTo(21, 6);
  });

  it('is 1 for a color against itself', () => {
    expect(contrast('#f6f3ec', '#f6f3ec')).toBeCloseTo(1, 10);
  });

  it('does not depend on the order of the two colors', () => {
    expect(contrast('#1a1714', '#f6f3ec')).toBeCloseTo(contrast('#f6f3ec', '#1a1714'), 12);
  });

  it('is about 4.48 for #777 on white, just under the AA line', () => {
    expect(contrast('#777', '#fff')).toBeCloseTo(4.48, 2);
    expect(contrast('#777', '#fff')).toBeLessThan(4.5);
  });

  it('is about 4.54 for #767676 on white, just over the AA line', () => {
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    expect(contrast('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('reads uppercase hex like lowercase hex', () => {
    expect(contrast('#FFF', '#000')).toBeCloseTo(21, 6);
    expect(contrast('#F6F3EC', '#1A1714')).toBeCloseTo(contrast('#f6f3ec', '#1a1714'), 12);
  });

  it('ignores the alpha digits of 4 and 8 digit hex', () => {
    expect(parseHex('#ffffff80')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex('#0f08')).toEqual({ r: 0, g: 255, b: 0 });
  });

  it('matches the ratios the design system quotes for ink on ground in the light theme', () => {
    // tokens.json: "16.1:1 ... on ground"
    expect(Math.round(contrast(themeColor('company-light', 'ink'), themeColor('company-light', 'ground')) * 10) / 10).toBe(16.1);
  });

  it('matches the ratio the design system quotes for ink-soft on ground in the light theme', () => {
    // tokens.json: "8.4:1 ... on ground"
    expect(Math.round(contrast(themeColor('company-light', 'ink-soft'), themeColor('company-light', 'ground')) * 10) / 10).toBe(8.4);
  });

  it('computes luminance 0 for black and 1 for white', () => {
    expect(luminance('#000')).toBe(0);
    expect(luminance('#fff')).toBeCloseTo(1, 10);
  });

  it('computes the mid-gray luminance the WCAG formula gives', () => {
    // sRGB 128/255 -> linear 0.2158
    expect(luminance('#808080')).toBeCloseTo(0.2159, 3);
  });

  it.each(['#12', '#ggg', 'red', '', '#12345', '#1234567'])('rejects %j as a hex color', (bad) => {
    expect(() => parseHex(bad)).toThrow(/not a hex color/);
  });

  it('formats a hex color as the rgb() string a browser reports', () => {
    expect(toRgbString('#f6f3ec')).toBe('rgb(246, 243, 236)');
    expect(toRgbString('#15120F')).toBe('rgb(21, 18, 15)');
    expect(toRgbString('#fff')).toBe('rgb(255, 255, 255)');
  });
});

describe('color: literal scanner on declaration values', () => {
  it.each(['#fff', '#FFF', '#a1b2c3', '#a1b2c3d4', '1px solid #abc', 'linear-gradient(#fff, #000)'])('flags a hex color in %j', (value) => {
    expect(colorLiteralsInValue(value).some((l) => l.kind === 'hex')).toBe(true);
  });

  it.each(['rgb(0 0 0)', 'rgba(0, 0, 0, .5)', 'hsl(10 20% 30%)', 'oklch(0.5 0.1 200)', 'color-mix(in srgb, var(--a), var(--b))', 'hwb(1 2% 3%)', 'light-dark(var(--a), var(--b))'])(
    'flags the color function in %j',
    (value) => {
      expect(colorLiteralsInValue(value).some((l) => l.kind === 'function')).toBe(true);
    },
  );

  it.each([
    ['color', 'red'],
    ['color', 'White'],
    ['background', 'white'],
    ['border', '1px solid black'],
    ['background-color', 'rebeccapurple'],
    ['outline', '2px solid grey'],
    ['fill', 'tan'],
    ['--shade', 'gray'],
    ['color', 'var(--ink, red)'],
  ])('flags the named color in %s: %s', (prop, value) => {
    expect(colorLiteralsInValue(value, prop).some((l) => l.kind === 'named')).toBe(true);
  });

  it.each([
    ['color', 'transparent'],
    ['color', 'currentColor'],
    ['color', 'currentcolor'],
    ['color', 'inherit'],
    ['background', 'none'],
    ['background-color', 'var(--ground)'],
    ['border', '1px solid var(--rule)'],
    ['outline', '2px solid var(--accent)'],
    ['font-family', 'Georgia, serif'],
    ['font-family', 'Tan, serif'], // a font named like a color is not a color
    ['content', '"#fff red"'],
    ['background', 'url(#fade)'],
    ['mask', 'url(data:image/svg+xml;utf8,<svg fill="%23fff"/>)'],
    ['color', 'var(--ink)'],
    ['transition', 'color .18s var(--ease)'],
    ['animation-name', 'red'],
  ])('does not flag %s: %s', (prop, value) => {
    expect(colorLiteralsInValue(value, prop)).toEqual([]);
  });

  it('accepts #0000, which is how the minifier writes transparent', () => {
    expect(colorLiteralsInValue('3px solid #0000')).toEqual([]);
    expect(colorLiteralsInValue('#00000000')).toEqual([]);
  });

  it('flags nearly transparent black, which is a real color', () => {
    expect(colorLiteralsInValue('#00000001')).toHaveLength(1);
  });

  it('reports every literal in a multi-value declaration', () => {
    expect(colorLiteralsInValue('0 0 0 1px #fff, 0 0 2px rgb(0 0 0)', 'box-shadow')).toHaveLength(2);
  });
});

describe('color: literal scanner on stylesheets', () => {
  it('flags literals in declarations but not hex-looking ids in selectors', () => {
    const css = '#add { color: var(--ink) } #fade, #beef .x { background: var(--ground) } #bad { color: #abc }';
    expect(colorLiteralsInCss(css)).toEqual([{ kind: 'hex', text: '#abc' }]);
  });

  it('does not flag ids like #work or #main in selectors', () => {
    expect(colorLiteralsInCss('#work { padding: 0 } #main:focus { outline: none } a[href="#work"] { color: var(--ink) }')).toEqual([]);
  });

  it('ignores literals inside comments', () => {
    expect(colorLiteralsInCss('/* color: #fff; red */ a { color: var(--ink) /* #000 */ }')).toEqual([]);
  });

  it('skips rules the caller exempts, such as the token blocks', () => {
    const css = ':root { --a: #fff } @media (prefers-color-scheme: dark) { :root { --a: #000 } } a { color: #123 }';
    expect(colorLiteralsInCss(css, (selector) => selector === ':root')).toEqual([{ kind: 'hex', text: '#123' }]);
  });

  it('finds literals inside at-rules', () => {
    expect(colorLiteralsInCss('@media (width<=860px) { a { color: red } }')).toEqual([{ kind: 'named', text: 'red' }]);
  });
});

describe('color: literal scanner on source files', () => {
  it('flags #fff and #a1b2c3 in markup and code', () => {
    expect(colorLiteralsInSource('<svg fill="#fff"></svg>')).toEqual([{ kind: 'hex', text: '#fff' }]);
    expect(colorLiteralsInSource("const accent = '#a1b2c3';")).toEqual([{ kind: 'hex', text: '#a1b2c3' }]);
  });

  it('flags color functions in code', () => {
    expect(colorLiteralsInSource('const a = "rgb(1, 2, 3)"; const b = `hsl(1 2% 3%)`; const c = "oklch(0.5 0 0)";')).toHaveLength(3);
  });

  it('flags a named color attribute but not currentColor or none', () => {
    expect(colorLiteralsInSource('<svg fill="red" stroke="currentColor"><path fill="none"/></svg>')).toEqual([{ kind: 'named', text: 'red' }]);
    expect(colorLiteralsInSource('<path fill="White" />')).toEqual([{ kind: 'named', text: 'White' }]);
  });

  it('does not flag #main in an href', () => {
    expect(colorLiteralsInSource('<a class="skip" href="#main">Skip to content</a>')).toEqual([]);
  });

  it('does not flag an anchor that happens to be valid hex, such as #fade or #decade', () => {
    expect(colorLiteralsInSource('<a href="#fade">x</a> <a href=\'#decade\'>y</a> <p id="beef"></p> <a aria-describedby="cafe"></a>')).toEqual([]);
  });

  it('does not flag character references like &#8217; or &#x2019;', () => {
    expect(colorLiteralsInSource('<p>don&#8217;t &#x2019; &#123456;</p>')).toEqual([]);
  });

  it('does not flag ids like #work in CSS selectors inside a style block', () => {
    expect(colorLiteralsInSource('<style>\n#work { padding: 0 }\n#other:target { color: var(--ink) }\n</style>')).toEqual([]);
  });

  it('flags a literal inside a style block', () => {
    expect(colorLiteralsInSource('<style>.a { color: #123456 }</style>')).toEqual([{ kind: 'hex', text: '#123456' }]);
    expect(colorLiteralsInSource('<style>.a { border: 1px solid white }</style>')).toEqual([{ kind: 'named', text: 'white' }]);
  });

  it('does not flag transparent or currentColor', () => {
    expect(colorLiteralsInSource('<style>.a { color: currentColor; background: transparent }</style><svg fill="currentColor"/>')).toEqual([]);
  });

  it('does not flag words that merely look like colors in prose', () => {
    expect(colorLiteralsInSource('<p>Red flags, white space, and a tan line.</p>')).toEqual([]);
  });

  it('ignores literals in comments', () => {
    expect(colorLiteralsInSource('<!-- #fff --> /* #000 */ <p>x</p>')).toEqual([]);
  });

  it('does not treat part of a word as a hex color', () => {
    expect(colorLiteralsInSource('foo#bad bar#ace')).toEqual([]);
  });
});

describe('css: parser', () => {
  const sheet = `
    /* a comment with { braces } and ; semicolons */
    @charset "utf-8";
    @font-face { font-family: "A;B"; src: url(data:font/woff2;base64,AAAA) format("woff2"); font-display: swap }
    :root { --ground: #f6f3ec; --font-display: "Instrument Serif", Georgia, serif; color-scheme: light }
    .a, .b:hover { color: var(--ink) !important; margin: 0 ! important }
    @media (prefers-color-scheme: dark) { :root { --ground: #15120f; color-scheme: dark } }
    @media (prefers-reduced-motion: reduce) { * { transition-duration: .01ms !IMPORTANT } }
    @media (width <= 860px) { .a { padding: 8px } @supports (display: grid) { .a { display: grid } } }
    .nest { color: red; &:hover { color: blue } }
  `;
  const nodes = parseCss(sheet);

  it('keeps strings and url() with semicolons whole', () => {
    const face = nodes.find((n) => n.name === 'font-face');
    expect(face?.declarations.map((d) => d.prop)).toEqual(['font-family', 'src', 'font-display']);
    expect(face?.declarations[0]?.value).toBe('"A;B"');
    expect(face?.declarations[1]?.value).toContain('url(data:font/woff2;base64,AAAA)');
  });

  it('parses statement at-rules like @charset without a block', () => {
    const charset = nodes.find((n) => n.name === 'charset');
    expect(charset?.hasBlock).toBe(false);
  });

  it('reads :root variables, and not the ones in the dark block', () => {
    const vars = rootVariables(nodes);
    expect(vars.get('--ground')).toBe('#f6f3ec');
    expect(vars.get('color-scheme')).toBe('light');
    expect(vars.get('--font-display')).toBe('"Instrument Serif", Georgia, serif');
  });

  it('reads the dark :root block', () => {
    const dark = darkRootVariables(nodes);
    expect(dark.get('--ground')).toBe('#15120f');
    expect(dark.get('color-scheme')).toBe('dark');
    expect([...dark.keys()]).toEqual(['--ground', 'color-scheme']);
  });

  it('flags !important in all spellings and finds the block it sits in', () => {
    const important = declarations(nodes).filter((c) => c.declaration.important);
    expect(important).toHaveLength(3);
    const outside = important.filter((c) => !inside(c, isReducedMotion));
    expect(outside.map((c) => c.declaration.prop)).toEqual(['color', 'margin']);
  });

  it('strips the !important marker from the value', () => {
    const d = declarations(nodes).find((c) => c.declaration.prop === 'margin');
    expect(d?.declaration.value).toBe('0');
  });

  it('descends into nested at-rules and nested rules', () => {
    const blocks = allBlocks(nodes);
    expect(blocks.some((b) => b.name === 'supports')).toBe(true);
    expect(blocks.some((b) => b.prelude === '&:hover')).toBe(true);
  });

  it('reads minified output', () => {
    const min = parseCss(':root{--a:#fff;color-scheme:light}@media (prefers-color-scheme:dark){:root{--a:#000}}a{color:red!important}');
    expect(rootVariables(min).get('--a')).toBe('#fff');
    expect(darkRootVariables(min).get('--a')).toBe('#000');
    const d = declarations(min).find((c) => c.declaration.prop === 'color');
    expect(d?.declaration).toMatchObject({ value: 'red', important: true });
  });

  it('merges several :root blocks, later ones winning', () => {
    const merged = parseCss(':root{--a:1;--b:2} .x{--a:9} :root{--a:3}');
    expect(Object.fromEntries(rootVariables(merged))).toEqual({ '--a': '3', '--b': '2' });
  });

  it('does not take :root inside another rule or a non-dark media query', () => {
    const odd = parseCss('@media (min-width: 10px) { :root { --a: 1 } } @media (prefers-color-scheme: light) { :root { --a: 2 } }');
    expect(rootVariables(odd).size).toBe(0);
    expect(darkRootVariables(odd).size).toBe(0);
  });

  it('is not fooled by a missing final brace or semicolon', () => {
    const rough = parseCss('a { color: red; background: blue');
    expect(declarations(rough).map((c) => c.declaration.prop)).toEqual(['color', 'background']);
  });

  it('does not treat reduced-motion: no-preference as the reduced-motion block', () => {
    const q = parseCss('@media (prefers-reduced-motion: no-preference) { a { transition: none !important } }');
    const d = declarations(q)[0]!;
    expect(inside(d, isReducedMotion)).toBe(false);
  });

  it('finds the forced-colors block, and only that block', () => {
    const q = parseCss('@media (forced-colors: active) { i { border: 4px solid } } @media (forced-colors: none) { i { border: 0 } } b { border: 0 }');
    expect(declarations(q).map((d) => inside(d, isForcedColors))).toEqual([true, false, false]);
  });

  it('strips comments but keeps strings that look like comments', () => {
    expect(stripComments('a/* x */b')).toBe('a b');
    expect(stripComments('content: "/* not a comment */"')).toBe('content: "/* not a comment */"');
    expect(stripComments('/* unterminated')).toBe(' ');
  });
});

describe('css: breakpoints', () => {
  it.each([
    ['@media (max-width: 860px) { a { x: y } }', [860]],
    ['@media (width<=860px){a{x:y}}', [860]],
    ['@media (min-width: 861px) { a { x: y } }', [861]],
    ['@container (max-width: 860px) { a { x: y } }', [860]],
    ['@container card (max-width:860px){a{x:y}}', [860]],
    ['@media (min-width: 40em) { a { x: y } }', [640]],
    ['@media (prefers-color-scheme: dark) { a { x: y } }', []],
    ['@media (prefers-reduced-motion: reduce) { a { x: y } }', []],
    ['@media screen and (min-width: 600px) and (max-width: 860px) { a { x: y } }', [600, 860]],
    ['@supports (display: grid) { a { x: y } }', []],
  ] as const)('reads %s', (css, expected) => {
    expect(breakpoints(parseCss(css))).toEqual(expected);
  });

  it('finds queries nested in other at-rules', () => {
    expect(breakpoints(parseCss('@supports (display: grid) { @media (max-width: 700px) { a { x: y } } }'))).toEqual([700]);
  });
});

describe('css: value helpers', () => {
  it('normalises spacing, leading zeros, quotes and case', () => {
    expect(normalizeValue('cubic-bezier(0.22, 1, 0.36, 1)')).toBe(normalizeValue('cubic-bezier(.22,1,.36,1)'));
    expect(normalizeValue('0.18s')).toBe('.18s');
    expect(normalizeValue("'Instrument Serif',  Georgia,serif")).toBe('"instrument serif",georgia,serif');
    expect(normalizeValue('1px solid RED !important')).toBe('1px solid red');
  });

  it('does not strip zeros from numbers like 10.5 or 100', () => {
    expect(normalizeValue('10.5px')).toBe('10.5px');
    expect(normalizeValue('100ms')).toBe('100ms');
    expect(normalizeValue('1.05')).toBe('1.05');
  });

  it('splits font-family lists into bare names', () => {
    expect(fontFamilies('"Instrument Serif", Georgia, serif')).toEqual(['Instrument Serif', 'Georgia', 'serif']);
    expect(fontFamilies("'Instrument Sans',system-ui")).toEqual(['Instrument Sans', 'system-ui']);
  });

  it('expands and lower-cases hex colors', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('#a1b2c3')).toBe('#a1b2c3');
    expect(normalizeHex('#FFFF')).toBe('#ffffff');
    expect(normalizeHex('#0000')).toBe('#00000000');
    expect(normalizeHex('#ffffffff')).toBe('#ffffff');
  });
});

describe('text: visible text extraction', () => {
  it('ignores style, script, template, svg, head and hidden elements', () => {
    const html = `<html><head><title>Not shown</title><style>p{color:red}</style></head><body>
      <p>Shown</p><script>var secret = 1;</script><style>.x{}</style>
      <template><p>Template</p></template><svg><title>Graphic</title></svg>
      <p hidden>Hidden</p><div hidden><p>Also hidden</p></div><noscript>No script</noscript><p>Also shown</p></body></html>`;
    expect(text(html)).toBe('Shown Also shown');
  });

  it('keeps text across inline tags without inventing spaces', () => {
    expect(text('<p>Hello <a href="#">world</a>, again</p>')).toBe('Hello world, again');
    expect(text('<p>glued<a href="#">link</a></p>')).toBe('gluedlink');
    expect(text('<p><a href="#">link</a>glued</p>')).toBe('linkglued');
    expect(text('<p>one <span>two <b>three</b></span> four</p>')).toBe('one two three four');
  });

  it('puts a space between block elements and between list items', () => {
    expect(text('<p>a</p><p>b</p>')).toBe('a b');
    expect(text('<ul><li>one</li><li>two</li></ul>')).toBe('one two');
    expect(text('<dl><dt>Term</dt><dd>Detail</dd></dl>')).toBe('Term Detail');
    expect(text('<div>a<div>b</div>c</div>')).toBe('a b c');
  });

  it('treats <br> as a break', () => {
    expect(text('<p>Human<br>operated</p>')).toBe('Human operated');
    expect(textBlocks(parseHtml('<p>Human<br>operated</p>'))).toEqual(['Human', 'operated']);
  });

  it('decodes &amp; &#8217; &nbsp; and friends', () => {
    expect(text('<p>Tom &amp; Jerry</p>')).toBe('Tom & Jerry');
    expect(text('<p>don&#8217;t</p>')).toBe('don\u2019t');
    expect(text('<p>don&#x2019;t</p>')).toBe('don\u2019t');
    expect(text('<p>a&nbsp;b</p>')).toBe('a b');
    expect(text('<p>1 &lt; 2 &gt; 0 &quot;ok&quot;</p>')).toBe('1 < 2 > 0 "ok"');
    expect(text('<p>a &mdash; b</p>')).toBe('a \u2014 b');
    expect(text('<p>a &middot; b</p>')).toBe('a \u00b7 b');
  });

  it('collapses runs of whitespace, newlines, tabs and non-breaking spaces', () => {
    expect(text('<p>  a \n\t b&nbsp;&nbsp; c  </p>')).toBe('a b c');
    expect(collapse(' \u00a0 x \u00a0 ')).toBe('x');
  });

  it('removes soft hyphens and zero-width spaces', () => {
    expect(collapse('con\u00adsent\u200bual')).toBe('consentual');
  });

  it('returns alt text separately from the visible text', () => {
    const root = parseHtml('<p>Hi <img src="a" alt="A cat"> there</p><img src="b" alt=""><div hidden><img src="c" alt="Hidden cat"></div><img src="d" alt="  Spaced   out ">');
    expect(visibleText(root)).toBe('Hi there');
    expect(altTexts(root)).toEqual(['A cat', 'Spaced out']);
  });

  it('works on a sub-tree', () => {
    const root = parseHtml('<main><section id="a"><h2>One</h2><p>x</p></section><section id="b"><h2>Two</h2></section></main>');
    expect(visibleText(one(root, '#b'))).toBe('Two');
    expect(textBlocks(one(root, '#a'))).toEqual(['One', 'x']);
  });

  it('is empty for an element with no text', () => {
    expect(visibleText(parseHtml('<div><i aria-hidden="true"></i></div>'))).toBe('');
  });

  it('keeps curly quotes and apostrophes as typed, so a straight one in the copy cannot pass for a curly one', () => {
    expect(textOf(parseHtml('<p>I&#8217;m &#8220;here&#8221;</p>'))).toBe('I\u2019m \u201chere\u201d');
    expect(textOf(parseHtml("<p>I'm here</p>"))).toBe("I'm here");
  });

  it('reads a middle dot with the spaces the markup gives it and adds none, so glued words in the page show up', () => {
    expect(visibleText(parseHtml('<p>Released<span class="sep"> \u00b7</span> v0.2.0</p>'))).toBe('Released \u00b7 v0.2.0');
    expect(visibleText(parseHtml('<p>A <span class="sep">\u00b7</span> B</p>'))).toBe('A \u00b7 B');
    expect(visibleText(parseHtml('<p>Released<span class="sep">\u00b7</span>v0.2.0</p>'))).toBe('Released\u00b7v0.2.0');
  });
});

describe('copy rules', () => {
  it('finds first person plural as whole words in any case', () => {
    expect(firstPersonPlural('We build. Our tools are ours. Tell us. WE, Us.')).toEqual(['We', 'Our', 'ours', 'us', 'WE', 'Us']);
    expect(firstPersonPlural("We're here, let's go, we'll see")).toEqual(['We', "let's", 'we']);
  });

  it('does not find we/our/us inside other words', () => {
    expect(firstPersonPlural('Weather, ourselves? no: house, bus, status, focus, Usage, user, weep, tower, hour, Windows')).toEqual(['ourselves']);
    expect(firstPersonPlural('I build it. Jeff Kazzee. You keep control.')).toEqual([]);
  });

  it('finds all-caps words outside the allowlist', () => {
    expect(allCapsWords('FREE stuff, NOW. AI and MIT and APIs and API, OS, CLI, CSS, HTML, LLM, V1, ZIP')).toEqual(['FREE', 'NOW']);
  });

  it('allows single capitals, mixed case, digits and version strings', () => {
    expect(allCapsWords("I'm A B C. GitHub, SmartScreen, JeffKazzee.dev, PyPI, v0.2.0, 262, Windows 10 and 11, X")).toEqual([]);
  });

  it('allows Roman numerals up to ten, which the feature numerals need, and nothing that merely looks like one', () => {
    expect(allCapsWords('I. The main project. II. Released. III IV V VI VII VIII IX X')).toEqual([]);
    expect(allCapsWords('MIX CIVIL')).toEqual(['MIX', 'CIVIL']);
  });

  it('flags a capitals word with a digit that is not allowed', () => {
    expect(allCapsWords('Windows XP2 and V2')).toEqual(['XP2', 'V2']);
  });

  it('finds banned words as whole words in any case, with endings', () => {
    expect(bannedWords('Unlock it. EMPOWER you, seamless, Robust, revolutionary, game-changing, elevate')).toEqual([
      'Unlock', 'EMPOWER', 'seamless', 'Robust', 'revolutionary', 'game-changing', 'elevate',
    ]);
    expect(bannedWords('unlocks and empowered and elevating')).toEqual(['unlocks', 'empowered', 'elevating']);
  });

  it('finds the adverb and noun forms, and nothing inside other words', () => {
    expect(bannedWords('elevator, unlockable, robustly sure? no: roboticist')).toEqual(['robustly']);
    expect(bannedWords('An elevator, a lock, a seam, a power tool, evolutionary')).toEqual([]);
  });

  it('finds retired names, case-sensitively', () => {
    expect(retiredNames('Wazoo and Hoolio and hoolio and Two tools')).toEqual(['Wazoo', 'Hoolio', 'Two tools']);
    expect(retiredNames('HOOLIO wazoo two tools')).toEqual([]);
  });

  it('counts em dashes, semicolons and exclamation marks', () => {
    expect(emDashes('a \u2014 b \u2014 c')).toBe(2);
    expect(emDashes('a - b \u2013 c')).toBe(0);
    expect(semicolons('a; b; c')).toBe(2);
    expect(exclamations('Hi! Wow!')).toBe(2);
    expect(exclamations('Hi.')).toBe(0);
  });

  it('finds emoji but not middle dots, digits or copyright-free punctuation', () => {
    expect(emoji('Ship it \u{1F680} \u{1F600}')).toHaveLength(2);
    expect(emoji('Released \u00b7 v0.2.0, 11 games, 262 countries')).toEqual([]);
  });

  it('finds dollar amounts', () => {
    expect(currency('Free. Or $40, or $1,000.50, or \u20ac5')).toEqual(['$40', '$1,000.50', '\u20ac5']);
    expect(currency('Free. Bring your own API keys.')).toEqual([]);
  });

  it('finds dates written month, day, year', () => {
    expect(dates('A preview came out Sept 22, 2026 and on October 8, 2026, then Oct 3, 2026.')).toEqual(['Sept 22, 2026', 'October 8, 2026', 'Oct 3, 2026']);
    expect(dates('Sept 22. In 2026. May 5')).toEqual([]);
  });

  it('flags Title Case words in headings and buttons but not proper nouns or sentence starts', () => {
    expect(titleCaseWords('Download For Windows')).toEqual(['For']);
    expect(titleCaseWords('What I don\'t do')).toEqual([]);
    expect(titleCaseWords('Other things I have made')).toEqual([]);
    expect(titleCaseWords('Unsigned Windows preview \u00b7 Sept 22, 2026')).toEqual([]);
    expect(titleCaseWords('Released \u00b7 v0.2.0')).toEqual([]);
    expect(titleCaseWords('I. The main project')).toEqual([]);
    expect(titleCaseWords('Now building Vivary. A Windows preview came out Sept 22.')).toEqual([]);
    expect(titleCaseWords('Source On GitHub')).toEqual(['On']);
    expect(titleCaseWords('Visit vivaryagent.xyz')).toEqual([]);
  });
});

describe('image readers', () => {
  const riff = (kind: string, payload: Buffer): Buffer => {
    const chunk = Buffer.concat([Buffer.from(kind, 'ascii'), Buffer.alloc(4), payload]);
    chunk.writeUInt32LE(payload.length, 4);
    const head = Buffer.alloc(12);
    head.write('RIFF', 0, 'ascii');
    head.writeUInt32LE(chunk.length + 4, 4);
    head.write('WEBP', 8, 'ascii');
    return Buffer.concat([head, chunk]);
  };

  it('reads the size and alpha flag of an extended WebP (VP8X)', () => {
    const payload = Buffer.alloc(10);
    payload[0] = 0x10; // alpha flag
    payload.writeUIntLE(760 - 1, 4, 3);
    payload.writeUIntLE(678 - 1, 7, 3);
    expect(readWebp(riff('VP8X', payload))).toEqual({ width: 760, height: 678, alpha: true });
    payload[0] = 0;
    expect(readWebp(riff('VP8X', payload))).toEqual({ width: 760, height: 678, alpha: false });
  });

  it('reads the size and alpha flag of a lossless WebP (VP8L)', () => {
    const payload = Buffer.alloc(5);
    payload[0] = 0x2f;
    payload.writeUInt32LE(((1 << 28) | ((600 - 1) << 14) | (960 - 1)) >>> 0, 1);
    expect(readWebp(riff('VP8L', payload))).toEqual({ width: 960, height: 600, alpha: true });
  });

  it('reads the size of a lossy WebP (VP8)', () => {
    const payload = Buffer.alloc(10);
    payload.set([0x9d, 0x01, 0x2a], 3);
    payload.writeUInt16LE(1200, 6);
    payload.writeUInt16LE(844, 8);
    expect(readWebp(riff('VP8 ', payload))).toEqual({ width: 1200, height: 844, alpha: false });
  });

  it('rejects other files', () => {
    expect(() => readWebp(Buffer.from('not an image at all, not even close, really'))).toThrow(/not a WebP/);
    expect(() => readWebp(riff('JUNK', Buffer.alloc(12)))).toThrow(/unknown WebP chunk/);
  });

  it('round-trips an RGB PNG and reads its size', () => {
    const png = encodePng(3, 2, 2, (x, y) => [x * 100, y * 100, 7]);
    expect(readPngSize(png)).toEqual({ width: 3, height: 2 });
    const decoded = decodePng(png);
    expect(pixelAt(decoded, 2, 1)).toEqual([200, 100, 7, 255]);
    expect(pixelAt(decoded, 0, 0)).toEqual([0, 0, 7, 255]);
  });

  it('round-trips an RGBA PNG', () => {
    const decoded = decodePng(encodePng(2, 2, 6, (x) => [10, 20, 30, x === 0 ? 0 : 255]));
    expect(pixelAt(decoded, 0, 1)).toEqual([10, 20, 30, 0]);
    expect(pixelAt(decoded, 1, 1)).toEqual([10, 20, 30, 255]);
  });

  describe('against an independent decoder (sharp, which reads PNGs with libpng)', () => {
    /** The pixels sharp reads from a PNG, as RGBA: gray and palette files are expanded the way decodePng expands them. */
    const sharpPixels = async (file: Buffer): Promise<{ width: number; height: number; rgba: Buffer }> => {
      const { data, info } = await sharp(file).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      return { width: info.width, height: info.height, rgba: data };
    };

    /** The colour type from the header chunk, and the set of row filters the file uses (the first byte of every row, once inflated). */
    const pngFacts = (file: Buffer): { colorType: number; filters: Set<number> } => {
      const channels: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
      let colorType = 0;
      let width = 0;
      const idat: Buffer[] = [];
      for (let pos = 8; pos < file.length; ) {
        const length = file.readUInt32BE(pos);
        const type = file.toString('ascii', pos + 4, pos + 8);
        if (type === 'IHDR') {
          width = file.readUInt32BE(pos + 8);
          colorType = file[pos + 17] ?? 0;
        } else if (type === 'IDAT') idat.push(file.subarray(pos + 8, pos + 8 + length));
        pos += 12 + length;
      }
      const raw = inflateSync(Buffer.concat(idat));
      const stride = width * (channels[colorType] ?? 1) + 1;
      const filters = new Set<number>();
      for (let row = 0; row * stride < raw.length; row++) filters.add(raw[row * stride] ?? -1);
      return { colorType, filters };
    };

    /** A fixed pseudo-random image: noise makes the encoder use every row filter, which smooth artwork would not. */
    const noise = (width: number, height: number, channels: number): Buffer => {
      const bytes = Buffer.alloc(width * height * channels);
      let seed = 12345;
      for (let i = 0; i < bytes.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        bytes[i] = seed >>> 24;
      }
      return bytes;
    };

    const KINDS = [
      { name: 'gray', colorType: 0, channels: 1, gray: true, palette: false },
      { name: 'gray with alpha', colorType: 4, channels: 2, gray: true, palette: false },
      { name: 'RGB', colorType: 2, channels: 3, gray: false, palette: false },
      { name: 'RGBA', colorType: 6, channels: 4, gray: false, palette: false },
      { name: 'palette', colorType: 3, channels: 3, gray: false, palette: true },
    ] as const;

    const encode = async (kind: (typeof KINDS)[number]): Promise<Buffer> => {
      let image = sharp(noise(61, 47, kind.channels), { raw: { width: 61, height: 47, channels: kind.channels } });
      if (kind.gray) image = image.toColourspace('b-w');
      return image.png({ adaptiveFiltering: true, palette: kind.palette, colours: 256, dither: 0 }).toBuffer();
    };

    it.each(KINDS.map((kind) => [kind.name, kind] as const))('decodes a %s PNG to the pixels sharp reads', async (_name, kind) => {
      const file = await encode(kind);
      expect(pngFacts(file).colorType, 'the sample is the kind of file the test is named for').toBe(kind.colorType);
      const ours = decodePng(file);
      const theirs = await sharpPixels(file);
      expect([ours.width, ours.height]).toEqual([theirs.width, theirs.height]);
      expect(Buffer.from(ours.pixels).equals(theirs.rgba)).toBe(true);
    });

    it('is checked against files that use all five row filters (none, sub, up, average, paeth)', async () => {
      const used = new Set<number>();
      for (const kind of KINDS) for (const filter of pngFacts(await encode(kind)).filters) used.add(filter);
      expect([...used].sort()).toEqual([0, 1, 2, 3, 4]);
    });

    it.each(listFiles(PUBLIC).filter((file) => file.endsWith('.png')))('decodes public/%s to the pixels sharp reads', async (file) => {
      const bytes = readFileSync(join(PUBLIC, file));
      const ours = decodePng(bytes);
      const theirs = await sharpPixels(bytes);
      expect([ours.width, ours.height]).toEqual([theirs.width, theirs.height]);
      expect(Buffer.from(ours.pixels).equals(theirs.rgba), `${file} decodes differently`).toBe(true);
    });
  });

  it('rejects non-PNG data', () => {
    expect(() => decodePng(Buffer.from('hello'))).toThrow(/not a PNG/);
    expect(() => readPngSize(Buffer.from('hello world, this is not a png'))).toThrow(/not a PNG/);
  });
});

describe('dom helpers', () => {
  const root = parseHtml(
    '<body><a class="skip" href="#main">Skip</a><nav><a href="/a/">A</a><a>no href</a><a href="/b/" tabindex="-1">B</a></nav>' +
      '<main id="main" tabindex="-1"><button>Go</button><button disabled>No</button><div hidden><a href="/h/">H</a></div><span tabindex="0">S</span><input type="text"></main></body>',
  );

  it('lists the elements a keyboard reaches, in DOM order', () => {
    expect(focusables(root).map((el) => el.rawTagName + ':' + (el.getAttribute('href') ?? el.getAttribute('type') ?? el.getAttribute('class') ?? el.text))).toEqual([
      'a:#main',
      'a:/a/',
      'button:Go',
      'span:S',
      'input:text',
    ]);
  });

  it('knows document order', () => {
    const [skip, nav, main] = [one(root, '.skip'), one(root, 'nav'), one(root, 'main')];
    expect(inOrder(root, [skip, nav, main])).toBe(true);
    expect(inOrder(root, [main, nav])).toBe(false);
    expect(inOrder(root, [skip, skip])).toBe(false);
    expect(documentOrder(root).get(skip)).toBeLessThan(documentOrder(root).get(main) ?? -1);
  });

  it('reports a readable error when an element is missing or ambiguous', () => {
    expect(() => one(root, 'h1', 'home')).toThrow(/exactly one element matching `h1` in home, found 0/);
    expect(() => one(root, 'button')).toThrow(/found 2/);
    expect(all(root, 'button')).toHaveLength(2);
  });
});

describe('link helpers', () => {
  it('splits an href into path and fragment', () => {
    expect(splitHref('/callout/#how')).toEqual({ path: '/callout/', fragment: 'how' });
    expect(splitHref('#main')).toEqual({ path: '', fragment: 'main' });
    expect(splitHref('/a/?x=1#y')).toEqual({ path: '/a/', fragment: 'y' });
    expect(splitHref('/a/')).toEqual({ path: '/a/', fragment: undefined });
    expect(splitHref('/a/#')).toEqual({ path: '/a/', fragment: '' });
  });

  it('reads srcset candidates', () => {
    expect(srcsetUrls('/a.webp')).toEqual(['/a.webp']);
    expect(srcsetUrls('/a.webp 1x, /b.webp 2x')).toEqual(['/a.webp', '/b.webp']);
    expect(srcsetUrls('/a-640.webp 640w,\n /a-760.webp 760w')).toEqual(['/a-640.webp', '/a-760.webp']);
  });

  it('resolves site paths to built files (needs `pnpm build`)', () => {
    expect(resolveSitePath('/')).toBe('index.html');
    expect(resolveSitePath('/callout/')).toBe('callout/index.html');
    expect(resolveSitePath('/callout')).toBe('callout/index.html');
    expect(resolveSitePath('/og.png')).toBe('og.png');
    expect(resolveSitePath('/favicon.svg')).toBe('favicon.svg');
    expect(resolveSitePath('/nope/')).toBeUndefined();
    expect(resolveSitePath('/nope.png')).toBeUndefined();
  });

  it('finds the ids of a built page (needs `pnpm build`)', () => {
    expect(fragmentsIn('index.html').has('main')).toBe(true);
    expect(fragmentsIn('index.html').has('definitely-not-there')).toBe(false);
  });
});

describe('page list and tokens', () => {
  it('lists the six pages with unique files, urls and titles', () => {
    expect(PAGES.map((p) => p.id)).toEqual(['home', 'callout', 'vivary', 'about', 'contact', 'not-found']);
    expect(new Set(PAGES.map((p) => p.file)).size).toBe(PAGES.length);
    expect(new Set(PAGES.map((p) => p.url)).size).toBe(PAGES.length);
    expect(new Set(PAGES.map((p) => p.title)).size).toBe(PAGES.length);
  });

  it('has the 17 color tokens in both company themes in design/tokens.json', () => {
    const tokens = loadTokens();
    expect(COLOR_NAMES).toHaveLength(17);
    expect(tokens.color.tokens.map((t) => t.name).sort()).toEqual([...COLOR_NAMES].sort());
    for (const t of tokens.color.tokens) {
      expect(t.value['company-light'], `${t.name} light`).toMatch(/^#[0-9a-f]{6}$/);
      expect(t.value['company-dark'], `${t.name} dark`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('reads a theme value by name', () => {
    const ground = loadTokens().color.tokens.find((token) => token.name === 'ground');
    expect(themeColor('company-light', 'ground')).toBe(ground?.value['company-light']);
    expect(themeColor('company-dark', 'ground')).toBe(ground?.value['company-dark']);
    expect(themeColor('company-light', 'ground')).not.toBe(themeColor('company-dark', 'ground'));
    expect(() => themeColor('company-light', 'no-such-token' as 'ground')).toThrow(/no no-such-token for company-light/);
  });
});
