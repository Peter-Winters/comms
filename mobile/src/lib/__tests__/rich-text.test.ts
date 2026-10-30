import { hasFormatting, parseHtml, parseWhatsAppMarkup, plainText } from '../rich-text';

const strip = (spans: object[]) =>
  spans.map((s) => Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)));

describe('parseHtml', () => {
  it('keeps bold runs and turns <br> into newlines', () => {
    expect(strip(parseHtml('Earn up to <strong>$18.70</strong>.<br><br>Move fast'))).toEqual([
      { text: 'Earn up to ' },
      { text: '$18.70', bold: true },
      { text: '.\n\nMove fast' },
    ]);
  });

  it('renders bullet and numbered lists', () => {
    expect(plainText(parseHtml('<ul><li>One</li><li>Two</li></ul>'))).toBe('• One\n• Two');
    expect(plainText(parseHtml('<p>Coming?</p><ol><li>Yes</li><li>No</li></ol>'))).toBe('Coming?\n1. Yes\n2. No');
  });

  it('turns matrix.to links into @mentions using the name callback', () => {
    const spans = parseHtml(
      '<a href="https://matrix.to/#/@whatsapp_1:comms.local">Brie (WA)</a> hi',
      (_user, text) => text.replace(' (WA)', ''),
    );
    expect(strip(spans)).toEqual([{ text: '@Brie', mention: true }, { text: ' hi' }]);
  });

  it('keeps ordinary links and decodes entities', () => {
    expect(strip(parseHtml('He&#39;s <a href="https://x.com/a?b=1&amp;c=2">here</a>'))).toEqual([
      { text: "He's " },
      { text: 'here', href: 'https://x.com/a?b=1&c=2' },
    ]);
  });

  it('drops the quoted reply fallback', () => {
    expect(plainText(parseHtml('<mx-reply><blockquote>old</blockquote></mx-reply>new'))).toBe('new');
  });

  it('only reports formatting when there is some', () => {
    expect(hasFormatting(parseHtml('plain <span>text</span>'))).toBe(false);
    expect(hasFormatting(parseHtml('<em>styled</em>'))).toBe(true);
  });
});

describe('parseWhatsAppMarkup', () => {
  it('handles *bold*, _italic_ and ~strike~ at word edges', () => {
    expect(strip(parseWhatsAppMarkup('*Throw in at 12:30* see _you_ ~not~ there'))).toEqual([
      { text: 'Throw in at 12:30', bold: true },
      { text: ' see ' },
      { text: 'you', italic: true },
      { text: ' ' },
      { text: 'not', strike: true },
      { text: ' there' },
    ]);
  });

  it('leaves maths and snake_case alone', () => {
    expect(strip(parseWhatsAppMarkup('2*3*4 and snake_case_name'))).toEqual([{ text: '2*3*4 and snake_case_name' }]);
  });
});
