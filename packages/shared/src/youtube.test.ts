import { describe, expect, it } from 'vitest';
import { youtubeEmbedUrl, youtubeId } from './youtube';

describe('youtube links', () => {
  it('reads the id from every common link shape', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=wNEMJeXmM_U')).toBe('wNEMJeXmM_U');
    expect(youtubeId('https://youtu.be/wNEMJeXmM_U?si=abc')).toBe('wNEMJeXmM_U');
    expect(youtubeId('https://m.youtube.com/watch?v=t0Z7KvotYkc&t=30s')).toBe('t0Z7KvotYkc');
    expect(youtubeId('https://www.youtube.com/shorts/I5tPZonSBZ8')).toBe('I5tPZonSBZ8');
    expect(youtubeId('youtube.com/embed/LF6szHGNNgQ')).toBe('LF6szHGNNgQ');
    expect(youtubeId('3BsstSq0dvA')).toBe('3BsstSq0dvA');
  });

  it('refuses anything that is not a YouTube video', () => {
    expect(youtubeId('https://evil.example/watch?v=wNEMJeXmM_U')).toBeNull();
    expect(youtubeId('https://www.youtube.com/playlist?list=PL123')).toBeNull();
    expect(youtubeId('not a link')).toBeNull();
    expect(youtubeId('https://youtu.be/short')).toBeNull();
  });

  it('plays through the privacy-enhanced player', () => {
    expect(youtubeEmbedUrl('wNEMJeXmM_U')).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/wNEMJeXmM_U\?/);
  });
});
