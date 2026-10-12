import { youtubeEmbedUrl } from '@digital-madrasa/shared';
import { createElement } from 'react';
import { Platform, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * YouTube's own privacy-enhanced player, 16:9. Only a video id reaches it,
 * and the page cannot navigate anywhere else: links inside the player stay
 * on youtube-nocookie.com.
 */
export function YouTubePlayer({ videoId, title }: { videoId: string; title: string }) {
  const theme = useTheme();
  const src = youtubeEmbedUrl(videoId);
  return (
    <View
      style={{
        width: '100%',
        aspectRatio: 16 / 9,
        borderRadius: theme.radius.md,
        overflow: 'hidden',
        backgroundColor: '#000000',
      }}
    >
      {Platform.OS === 'web' ? (
        createElement('iframe', {
          src,
          title,
          style: { width: '100%', height: '100%', border: 0 },
          allow: 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture',
          allowFullScreen: true,
        })
      ) : (
        <WebView
          source={{ uri: src }}
          allowsFullscreenVideo
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          // Stay inside YouTube's player: no wandering off to other sites.
          onShouldStartLoadWithRequest={(req) => /^https:\/\/(www\.)?(youtube-nocookie\.com|youtube\.com|google\.com|gstatic\.com|ytimg\.com)/.test(req.url) || req.url === 'about:blank'}
          style={{ flex: 1, backgroundColor: '#000000' }}
        />
      )}
    </View>
  );
}
