import type { RichSpan } from './types';

type Format = Omit<RichSpan, 'text'>;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

const TAG_FORMATS: Record<string, Format> = {
  strong: { bold: true },
  b: { bold: true },
  h1: { bold: true },
  h2: { bold: true },
  h3: { bold: true },
  h4: { bold: true },
  h5: { bold: true },
  h6: { bold: true },
  em: { italic: true },
  i: { italic: true },
  del: { strike: true },
  s: { strike: true },
  strike: { strike: true },
  code: { code: true },
  pre: { code: true },
  blockquote: { quote: true },
};
const BLOCKS = new Set(['p', 'div', 'pre', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol']);

/**
 * Converts Matrix HTML (formatted_body) into styled runs of text. `mentionName` turns a
 * matrix.to user link into the name to show, or undefined to keep the link's own text.
 */
export function parseHtml(html: string, mentionName?: (userId: string, linkText: string) => string): RichSpan[] {
  const spans: RichSpan[] = [];
  const stack: { tag: string; format: Format; user?: string }[] = [];
  const lists: { ordered: boolean; n: number }[] = [];
  let skipDepth = 0; // inside <mx-reply>, the quoted reply fallback
  let mention: { text: string } | null = null;

  const current = (): Format => Object.assign({}, ...stack.map((s) => s.format));
  const lastChar = () => {
    for (let i = spans.length - 1; i >= 0; i--) if (spans[i].text) return spans[i].text.slice(-1);
    return '\n';
  };
  const push = (text: string, format: Format = current()) => {
    if (!text) return;
    const prev = spans[spans.length - 1];
    if (prev && sameFormat(prev, format)) prev.text += text;
    else spans.push({ ...format, text });
  };
  const newline = () => {
    if (lastChar() !== '\n') push('\n', {});
  };

  for (const m of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)\/?>|([^<]+)/g)) {
    const [, closing, rawTag, attrs, text] = m;
    if (text !== undefined) {
      if (skipDepth) continue;
      const inPre = stack.some((s) => s.tag === 'pre');
      const decoded = decodeEntities(inPre ? text : text.replace(/\s*\n\s*/g, ' '));
      if (mention) mention.text += decoded;
      else push(decoded);
      continue;
    }
    const tag = rawTag.toLowerCase();
    if (tag === 'mx-reply') {
      skipDepth += closing ? -1 : 1;
      continue;
    }
    if (skipDepth) continue;

    if (!closing) {
      if (tag === 'br') push('\n', {});
      else if (tag === 'hr') {
        newline();
        push('\n', {});
      } else if (tag === 'li') {
        newline();
        const list = lists[lists.length - 1];
        push(list?.ordered ? `${++list.n}. ` : '• ', {});
      } else if (tag === 'ul' || tag === 'ol') {
        newline();
        const start = Number(attrs.match(/start="(\d+)"/)?.[1] ?? 1);
        lists.push({ ordered: tag === 'ol', n: start - 1 });
      } else if (tag === 'a') {
        const href = decodeEntities(attrs.match(/href="([^"]*)"/)?.[1] ?? '');
        const user = href.match(/^https:\/\/matrix\.to\/#\/(@[^/?]+)/)?.[1];
        if (user) mention = { text: '' };
        stack.push({ tag, format: user ? {} : { href }, user: user && decodeURIComponent(user) });
      } else {
        if (BLOCKS.has(tag)) newline();
        stack.push({ tag, format: TAG_FORMATS[tag] ?? {} });
      }
      continue;
    }

    // Closing tag: pop back to the matching opener.
    const at = stack.map((s) => s.tag).lastIndexOf(tag);
    if (tag === 'ul' || tag === 'ol') {
      lists.pop();
      newline();
      continue;
    }
    if (at < 0) continue;
    const [opened] = stack.splice(at);
    if (tag === 'a' && mention) {
      const user = opened.user ?? '';
      const linkText = mention.text.trim();
      const name = (mentionName?.(user, linkText) ?? linkText).replace(/^@/, '');
      mention = null;
      if (name) spans.push({ ...current(), text: `@${name}`, mention: true });
    } else if (BLOCKS.has(tag)) {
      newline();
    }
  }

  // Trim blank lines at either end.
  while (spans.length && !spans[0].text.trim()) spans.shift();
  while (spans.length && !spans[spans.length - 1].text.trim()) spans.pop();
  if (spans.length) {
    spans[0].text = spans[0].text.replace(/^\s+/, '');
    const last = spans[spans.length - 1];
    last.text = last.text.replace(/\s+$/, '');
  }
  return spans;
}

/** True if any run has formatting worth rendering (plain text renders fine without). */
export function hasFormatting(spans: RichSpan[]) {
  return spans.some((s) => s.bold || s.italic || s.strike || s.code || s.quote || s.href || s.mention);
}

/** The text as it reads on screen, e.g. for copying or previews. */
export function plainText(spans: RichSpan[]) {
  return spans.map((s) => s.text).join('');
}

/** WhatsApp-style *bold*, _italic_, ~strike~ and ```code``` in plain text. */
export function parseWhatsAppMarkup(text: string): RichSpan[] {
  const spans: RichSpan[] = [];
  const re = /```([\s\S]+?)```|\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    // Markers must sit at word edges, so "2*3*4" or snake_case_names are left alone.
    const before = text[m.index - 1];
    const after = text[m.index + m[0].length];
    if ((before && /\w/.test(before)) || (after && /\w/.test(after))) continue;
    if (m.index > last) spans.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) spans.push({ text: m[1], code: true });
    else if (m[2] !== undefined) spans.push({ text: m[2], bold: true });
    else if (m[3] !== undefined) spans.push({ text: m[3], italic: true });
    else spans.push({ text: m[4], strike: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) spans.push({ text: text.slice(last) });
  return spans;
}

function sameFormat(a: Format, b: Format) {
  const keys: (keyof Format)[] = ['bold', 'italic', 'strike', 'code', 'quote', 'href', 'mention'];
  return keys.every((k) => (a[k] ?? undefined) === (b[k] ?? undefined));
}
