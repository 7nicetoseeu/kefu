import react from "@vitejs/plugin-react";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { resolve } from "path";
import { defineConfig, type Plugin } from "vite";

/**
 * 构建时将 manifest.json 和 icons 复制到 dist/ 目录
 */
function copyManifestPlugin(): Plugin {
  return {
    name: "copy-manifest",
    writeBundle() {
      const root = resolve(__dirname);
      const dist = resolve(root, "dist");

      if (!existsSync(dist)) {
        mkdirSync(dist, { recursive: true });
      }

      // 复制 manifest.json
      const manifestSrc = resolve(root, "manifest.json");
      const manifestDst = resolve(dist, "manifest.json");
      copyFileSync(manifestSrc, manifestDst);
      console.log("✓ 已复制 manifest.json → dist/");

      // 复制 icons 目录
      const iconsSrc = resolve(root, "icons");
      const iconsDst = resolve(dist, "icons");
      if (existsSync(iconsSrc)) {
        if (!existsSync(iconsDst)) {
          mkdirSync(iconsDst, { recursive: true });
        }
        for (const file of readdirSync(iconsSrc)) {
          copyFileSync(resolve(iconsSrc, file), resolve(iconsDst, file));
        }
        console.log("✓ 已复制 icons/ → dist/icons/");
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyManifestPlugin()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Content Script 和 Background 使用 IIFE 以兼容 Chrome Extension
    // Side Panel 使用标准 ES 模块（由 Vite 处理）
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        background: resolve(__dirname, "src/background/background.ts"),
        contentScript: resolve(__dirname, "src/content/contentScript.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          switch (chunkInfo.name) {
            case "background":
              return "src/background/background.js";
            case "contentScript":
              return "src/content/contentScript.js";
            default:
              return "assets/[name]-[hash].js";
          }
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
        // 对于 Content Script，使用 IIFE；Background 使用 ES（声明了 type: module）
        // Rollup 默认为 ES 模块，content script 作为入口会内联所有依赖
      },
    },
    modulePreload: false,
  },
});
