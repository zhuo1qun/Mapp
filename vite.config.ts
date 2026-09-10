import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          manifest: false,
          workbox: {
            // Workbox 默认最多只会预缓存 2MiB 的资源；你的构建产物有超过该大小的 chunk，
            // 如果不调整会导致构建阶段直接失败。
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MiB
            // 仅预缓存 Vite 输出的内容哈希资源。尤其不能把 index.html / 导航请求
            // 放进 Workbox，否则发布后可能继续打开旧页面。
            globPatterns: ['assets/**/*.{js,css,ico,png,svg,woff,woff2}'],
            globDirectory: 'dist',
            // HTML 与 SPA 导航始终走网络，由部署层的 must-revalidate 头控制。
            navigateFallback: null,
            skipWaiting: true,
            clientsClaim: true,
            cleanupOutdatedCaches: true,
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/.*\.tile\.openstreetmap\.org\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'openstreetmap-tiles',
                  expiration: {
                    maxEntries: 500,
                    maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                  },
                  cacheableResponse: {
                    statuses: [0, 200],
                  },
                },
              },
            ],
          },
        }),
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
