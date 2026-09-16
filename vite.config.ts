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
        tailwindcss(),
        react(),
        VitePWA({
          // 由应用代码注册，以便新版就绪时明确提示当前用户刷新。
          injectRegister: false,
          registerType: 'prompt',
          manifest: false,
          workbox: {
            // Workbox 默认最多只会预缓存 2MiB 的资源；你的构建产物有超过该大小的 chunk，
            // 如果不调整会导致构建阶段直接失败。
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MiB
            // 不预缓存 JavaScript。若把全部哈希脚本都放进 precache，动态 import
            // 的视图仍会在后台被一次性下载，懒加载便失去网络层面的意义。
            // 已访问的脚本由下面的运行时缓存保存；CSS、图标与字体仍可预缓存。
            // index.html / 导航请求也不能放进 Workbox，否则发布后可能继续打开旧页面。
            globPatterns: ['assets/**/*.{css,ico,png,svg,woff,woff2}'],
            globDirectory: 'dist',
            // HTML 与 SPA 导航始终走网络，由部署层的 must-revalidate 头控制。
            navigateFallback: null,
            skipWaiting: true,
            clientsClaim: true,
            cleanupOutdatedCaches: true,
            runtimeCaching: [
              {
                // Vite 资源名包含内容哈希，Cache First 对发布安全；模块仅在对应
                // 视图实际打开后才入缓存，后续离线重访则直接使用已缓存版本。
                urlPattern: /\/assets\/.*\.js$/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'app-modules',
                  expiration: {
                    maxEntries: 160,
                    maxAgeSeconds: 60 * 60 * 24 * 30,
                  },
                  cacheableResponse: {
                    statuses: [0, 200],
                  },
                },
              },
              {
                // 底图变化频率远低于用户的平移/缩放频率。短期 Cache First 能让已
                // 访问区域不再与当前视口争抢重验证请求；过期后才向图源取新版本。
                urlPattern: /^https:\/(?:\/.*\.tile\.openstreetmap\.org|\/server\.arcgisonline\.com\/ArcGIS\/rest\/services)\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'map-tiles',
                  expiration: {
                    maxEntries: 800,
                    maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
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
