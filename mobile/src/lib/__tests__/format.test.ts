import { contactName, previewText, sharedPostFrom, stripLinks, typingText } from '../format';

describe('sharedPostFrom', () => {
  it('recognises reels, posts and stories and drops tracking parameters', () => {
    expect(sharedPostFrom('https://www.instagram.com/reel/DewRCUKBjNe/?id=401_86&is_sponsored=false')).toEqual({
      url: 'https://www.instagram.com/reel/DewRCUKBjNe/',
      label: 'Reel',
    });
    expect(sharedPostFrom('https://www.instagram.com/p/abc/')?.label).toBe('Post');
    expect(sharedPostFrom('https://instagram.com/stories/someone/1/')?.label).toBe('Story');
  });

  it('ignores other links', () => {
    expect(sharedPostFrom('https://t.me/channel/1')).toBeUndefined();
    expect(sharedPostFrom(undefined)).toBeUndefined();
  });
});

describe('stripLinks', () => {
  it('removes Markdown and bare links but keeps words', () => {
    expect(stripLinks('[https://x.com/a](https://x.com/a?b=1)')).toBe('');
    expect(stripLinks('look at this https://x.com/a')).toBe('look at this');
  });
});

describe('previewText', () => {
  it('summarises special messages for the inbox', () => {
    expect(previewText('poll', 'Kick-off?')).toBe('📊 Kick-off?');
    expect(previewText('deleted', '')).toBe('🚫 Message deleted');
    expect(previewText('unavailable', "Photo couldn't be loaded\nnice one")).toBe("⚠️ Photo couldn't be loaded");
    expect(previewText('image', '', undefined, { url: 'u', label: 'Reel' })).toBe('🎬 Reel');
    expect(previewText('video', '', { uri: 'u', gif: true })).toBe('🎞️ GIF');
    expect(previewText('file', '', { uri: 'u', name: 'Zack.vcf', contact: true })).toBe('👤 Zack');
  });
});

describe('small helpers', () => {
  it('names contacts and typists', () => {
    expect(contactName('Zack.vcf')).toBe('Zack');
    expect(contactName(undefined)).toBe('Contact');
    expect(typingText(['Dan'])).toBe('Dan is typing…');
    expect(typingText(['Dan', 'Priya'])).toBe('Dan and Priya are typing…');
    expect(typingText(['A', 'B', 'C'])).toBe('3 people are typing…');
  });
});
