// vite.config.js
import { defineConfig, loadEnv } from "file:///D:/dtx8/chatgpt-extension/node_modules/vite/dist/node/index.js";
import path from "node:path";
import { promises as fs } from "node:fs";
var __vite_injected_original_dirname = "D:\\dtx8\\chatgpt-extension";
function validateEnvPlugin() {
  return {
    name: "validate-required-env",
    apply: "build",
    configResolved(config) {
      const mode = config.mode || "production";
      const envDir = config.envDir || process.cwd();
      const env = loadEnv(mode, envDir, "");
      const requiredEnvVars = [
        "VITE_SUPABASE_URL",
        "VITE_SUPABASE_ANON_KEY"
      ];
      const placeholderPatterns = [
        /your-project\.supabase\.co/i,
        /your-anon-key/i,
        /your.*here/i,
        /placeholder/i,
        /changeme/i
      ];
      const missing = [];
      const placeholder = [];
      for (const varName of requiredEnvVars) {
        const value = env[varName] || process.env[varName];
        if (!value || value.trim() === "") {
          missing.push(varName);
        } else if (placeholderPatterns.some((pattern) => pattern.test(value))) {
          placeholder.push(varName);
        }
      }
      if (missing.length > 0 || placeholder.length > 0) {
        const errorLines = [
          "\n\u274C Build Error: Invalid environment variable configuration!",
          ""
        ];
        if (missing.length > 0) {
          errorLines.push("Missing variables:");
          errorLines.push(...missing.map((v) => `  - ${v}`));
          errorLines.push("");
        }
        if (placeholder.length > 0) {
          errorLines.push("Variables with placeholder values (need real credentials):");
          errorLines.push(...placeholder.map((v) => `  - ${v}`));
          errorLines.push("");
        }
        errorLines.push("Please ensure your .env file contains valid Supabase credentials:");
        errorLines.push("  VITE_SUPABASE_URL=https://your-project.supabase.co");
        errorLines.push("  VITE_SUPABASE_ANON_KEY=your-anon-key-here");
        errorLines.push("");
        errorLines.push("Get these from: https://app.supabase.com/project/_/settings/api");
        errorLines.push("");
        console.error(errorLines.join("\n"));
        process.exit(1);
      }
      console.log("\u2705 Required environment variables validated successfully");
    }
  };
}
async function copyFile(src, dest) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}
async function copyDir(srcDir, destDir) {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await copyFile(srcPath, destPath);
    }
  }
}
function copyExtensionStatic() {
  return {
    name: "copy-extension-static",
    apply: "build",
    async closeBundle() {
      const root = __vite_injected_original_dirname;
      const outDir = path.resolve(root, "dist");
      const staticDir = path.resolve(root, "src", "extension");
      await copyFile(path.resolve(staticDir, "manifest.json"), path.resolve(outDir, "manifest.json"));
      await copyFile(path.resolve(staticDir, "sidepanel.html"), path.resolve(outDir, "sidepanel.html"));
      await copyFile(path.resolve(staticDir, "popup.html"), path.resolve(outDir, "popup.html"));
      await copyFile(path.resolve(staticDir, "styles.css"), path.resolve(outDir, "styles.css"));
      await copyFile(path.resolve(staticDir, "prompt-template.md"), path.resolve(outDir, "prompt-template.md"));
      const imagesDir = path.resolve(staticDir, "images");
      await copyDir(imagesDir, path.resolve(outDir, "images"));
      const promptsDir = path.resolve(root, "src", "prompts");
      await copyDir(promptsDir, path.resolve(outDir, "prompts"));
    }
  };
}
var vite_config_default = defineConfig({
  plugins: [
    validateEnvPlugin(),
    // X51LABS-130: Validate env vars before build
    copyExtensionStatic()
  ],
  // X51LABS-79: TODO - Add build size validation plugin (requires CJS or external script)
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV !== "production",
    // X51LABS-98: Only in development
    chunkSizeWarningLimit: 2e3,
    rollupOptions: {
      input: {
        background: path.resolve(__vite_injected_original_dirname, "src/background/index.js"),
        content: path.resolve(__vite_injected_original_dirname, "src/content.js"),
        ui: path.resolve(__vite_injected_original_dirname, "src/ui/index.js")
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name]-[hash].js",
        format: "es"
        // X51LABS-79: Removed manualChunks - Vite auto-splits optimally
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxkdHg4XFxcXGNoYXRncHQtZXh0ZW5zaW9uXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJEOlxcXFxkdHg4XFxcXGNoYXRncHQtZXh0ZW5zaW9uXFxcXHZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9EOi9kdHg4L2NoYXRncHQtZXh0ZW5zaW9uL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnLCBsb2FkRW52IH0gZnJvbSAndml0ZSc7XHJcbmltcG9ydCBwYXRoIGZyb20gJ25vZGU6cGF0aCc7XHJcbmltcG9ydCB7IHByb21pc2VzIGFzIGZzIH0gZnJvbSAnbm9kZTpmcyc7XHJcblxyXG4vKipcclxuICogVml0ZSBwbHVnaW4gdG8gdmFsaWRhdGUgcmVxdWlyZWQgZW52aXJvbm1lbnQgdmFyaWFibGVzIGF0IGJ1aWxkIHRpbWVcclxuICogWDUxTEFCUy0xMzA6IFByZXZlbnQgcnVudGltZSBlcnJvcnMgZnJvbSBtaXNzaW5nIFN1cGFiYXNlIGNvbmZpZ1xyXG4gKi9cclxuZnVuY3Rpb24gdmFsaWRhdGVFbnZQbHVnaW4oKSB7XHJcbiAgcmV0dXJuIHtcclxuICAgIG5hbWU6ICd2YWxpZGF0ZS1yZXF1aXJlZC1lbnYnLFxyXG4gICAgYXBwbHk6ICdidWlsZCcsXHJcbiAgICBjb25maWdSZXNvbHZlZChjb25maWcpIHtcclxuICAgICAgLy8gTG9hZCAuZW52IGZpbGVzIG1hbnVhbGx5IC0gY29uZmlnIGhvb2sgcnVucyBiZWZvcmUgVml0ZSBsb2FkcyBlbnZcclxuICAgICAgY29uc3QgbW9kZSA9IGNvbmZpZy5tb2RlIHx8ICdwcm9kdWN0aW9uJztcclxuICAgICAgY29uc3QgZW52RGlyID0gY29uZmlnLmVudkRpciB8fCBwcm9jZXNzLmN3ZCgpO1xyXG4gICAgICBjb25zdCBlbnYgPSBsb2FkRW52KG1vZGUsIGVudkRpciwgJycpO1xyXG5cclxuICAgICAgY29uc3QgcmVxdWlyZWRFbnZWYXJzID0gW1xyXG4gICAgICAgICdWSVRFX1NVUEFCQVNFX1VSTCcsXHJcbiAgICAgICAgJ1ZJVEVfU1VQQUJBU0VfQU5PTl9LRVknXHJcbiAgICAgIF07XHJcblxyXG4gICAgICBjb25zdCBwbGFjZWhvbGRlclBhdHRlcm5zID0gW1xyXG4gICAgICAgIC95b3VyLXByb2plY3RcXC5zdXBhYmFzZVxcLmNvL2ksXHJcbiAgICAgICAgL3lvdXItYW5vbi1rZXkvaSxcclxuICAgICAgICAveW91ci4qaGVyZS9pLFxyXG4gICAgICAgIC9wbGFjZWhvbGRlci9pLFxyXG4gICAgICAgIC9jaGFuZ2VtZS9pXHJcbiAgICAgIF07XHJcblxyXG4gICAgICBjb25zdCBtaXNzaW5nID0gW107XHJcbiAgICAgIGNvbnN0IHBsYWNlaG9sZGVyID0gW107XHJcblxyXG4gICAgICBmb3IgKGNvbnN0IHZhck5hbWUgb2YgcmVxdWlyZWRFbnZWYXJzKSB7XHJcbiAgICAgICAgY29uc3QgdmFsdWUgPSBlbnZbdmFyTmFtZV0gfHwgcHJvY2Vzcy5lbnZbdmFyTmFtZV07XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKCF2YWx1ZSB8fCB2YWx1ZS50cmltKCkgPT09ICcnKSB7XHJcbiAgICAgICAgICBtaXNzaW5nLnB1c2godmFyTmFtZSk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChwbGFjZWhvbGRlclBhdHRlcm5zLnNvbWUocGF0dGVybiA9PiBwYXR0ZXJuLnRlc3QodmFsdWUpKSkge1xyXG4gICAgICAgICAgcGxhY2Vob2xkZXIucHVzaCh2YXJOYW1lKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmIChtaXNzaW5nLmxlbmd0aCA+IDAgfHwgcGxhY2Vob2xkZXIubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIGNvbnN0IGVycm9yTGluZXMgPSBbXHJcbiAgICAgICAgICAnXFxuXHUyNzRDIEJ1aWxkIEVycm9yOiBJbnZhbGlkIGVudmlyb25tZW50IHZhcmlhYmxlIGNvbmZpZ3VyYXRpb24hJyxcclxuICAgICAgICAgICcnXHJcbiAgICAgICAgXTtcclxuXHJcbiAgICAgICAgaWYgKG1pc3NpbmcubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgZXJyb3JMaW5lcy5wdXNoKCdNaXNzaW5nIHZhcmlhYmxlczonKTtcclxuICAgICAgICAgIGVycm9yTGluZXMucHVzaCguLi5taXNzaW5nLm1hcCh2ID0+IGAgIC0gJHt2fWApKTtcclxuICAgICAgICAgIGVycm9yTGluZXMucHVzaCgnJyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAocGxhY2Vob2xkZXIubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgZXJyb3JMaW5lcy5wdXNoKCdWYXJpYWJsZXMgd2l0aCBwbGFjZWhvbGRlciB2YWx1ZXMgKG5lZWQgcmVhbCBjcmVkZW50aWFscyk6Jyk7XHJcbiAgICAgICAgICBlcnJvckxpbmVzLnB1c2goLi4ucGxhY2Vob2xkZXIubWFwKHYgPT4gYCAgLSAke3Z9YCkpO1xyXG4gICAgICAgICAgZXJyb3JMaW5lcy5wdXNoKCcnKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGVycm9yTGluZXMucHVzaCgnUGxlYXNlIGVuc3VyZSB5b3VyIC5lbnYgZmlsZSBjb250YWlucyB2YWxpZCBTdXBhYmFzZSBjcmVkZW50aWFsczonKTtcclxuICAgICAgICBlcnJvckxpbmVzLnB1c2goJyAgVklURV9TVVBBQkFTRV9VUkw9aHR0cHM6Ly95b3VyLXByb2plY3Quc3VwYWJhc2UuY28nKTtcclxuICAgICAgICBlcnJvckxpbmVzLnB1c2goJyAgVklURV9TVVBBQkFTRV9BTk9OX0tFWT15b3VyLWFub24ta2V5LWhlcmUnKTtcclxuICAgICAgICBlcnJvckxpbmVzLnB1c2goJycpO1xyXG4gICAgICAgIGVycm9yTGluZXMucHVzaCgnR2V0IHRoZXNlIGZyb206IGh0dHBzOi8vYXBwLnN1cGFiYXNlLmNvbS9wcm9qZWN0L18vc2V0dGluZ3MvYXBpJyk7XHJcbiAgICAgICAgZXJyb3JMaW5lcy5wdXNoKCcnKTtcclxuXHJcbiAgICAgICAgY29uc29sZS5lcnJvcihlcnJvckxpbmVzLmpvaW4oJ1xcbicpKTtcclxuICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnNvbGUubG9nKCdcdTI3MDUgUmVxdWlyZWQgZW52aXJvbm1lbnQgdmFyaWFibGVzIHZhbGlkYXRlZCBzdWNjZXNzZnVsbHknKTtcclxuICAgIH1cclxuICB9O1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBjb3B5RmlsZShzcmMsIGRlc3QpIHtcclxuICBhd2FpdCBmcy5ta2RpcihwYXRoLmRpcm5hbWUoZGVzdCksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xyXG4gIGF3YWl0IGZzLmNvcHlGaWxlKHNyYywgZGVzdCk7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGNvcHlEaXIoc3JjRGlyLCBkZXN0RGlyKSB7XHJcbiAgYXdhaXQgZnMubWtkaXIoZGVzdERpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XHJcbiAgY29uc3QgZW50cmllcyA9IGF3YWl0IGZzLnJlYWRkaXIoc3JjRGlyLCB7IHdpdGhGaWxlVHlwZXM6IHRydWUgfSk7XHJcbiAgZm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XHJcbiAgICBjb25zdCBzcmNQYXRoID0gcGF0aC5qb2luKHNyY0RpciwgZW50cnkubmFtZSk7XHJcbiAgICBjb25zdCBkZXN0UGF0aCA9IHBhdGguam9pbihkZXN0RGlyLCBlbnRyeS5uYW1lKTtcclxuICAgIGlmIChlbnRyeS5pc0RpcmVjdG9yeSgpKSB7XHJcbiAgICAgIGF3YWl0IGNvcHlEaXIoc3JjUGF0aCwgZGVzdFBhdGgpO1xyXG4gICAgfSBlbHNlIGlmIChlbnRyeS5pc0ZpbGUoKSkge1xyXG4gICAgICBhd2FpdCBjb3B5RmlsZShzcmNQYXRoLCBkZXN0UGF0aCk7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBjb3B5RXh0ZW5zaW9uU3RhdGljKCkge1xyXG4gIHJldHVybiB7XHJcbiAgICBuYW1lOiAnY29weS1leHRlbnNpb24tc3RhdGljJyxcclxuICAgIGFwcGx5OiAnYnVpbGQnLFxyXG4gICAgYXN5bmMgY2xvc2VCdW5kbGUoKSB7XHJcbiAgICAgIGNvbnN0IHJvb3QgPSBfX2Rpcm5hbWU7XHJcbiAgICAgIGNvbnN0IG91dERpciA9IHBhdGgucmVzb2x2ZShyb290LCAnZGlzdCcpO1xyXG5cclxuICAgICAgY29uc3Qgc3RhdGljRGlyID0gcGF0aC5yZXNvbHZlKHJvb3QsICdzcmMnLCAnZXh0ZW5zaW9uJyk7XHJcblxyXG4gICAgICBhd2FpdCBjb3B5RmlsZShwYXRoLnJlc29sdmUoc3RhdGljRGlyLCAnbWFuaWZlc3QuanNvbicpLCBwYXRoLnJlc29sdmUob3V0RGlyLCAnbWFuaWZlc3QuanNvbicpKTtcclxuICAgICAgYXdhaXQgY29weUZpbGUocGF0aC5yZXNvbHZlKHN0YXRpY0RpciwgJ3NpZGVwYW5lbC5odG1sJyksIHBhdGgucmVzb2x2ZShvdXREaXIsICdzaWRlcGFuZWwuaHRtbCcpKTtcclxuICAgICAgYXdhaXQgY29weUZpbGUocGF0aC5yZXNvbHZlKHN0YXRpY0RpciwgJ3BvcHVwLmh0bWwnKSwgcGF0aC5yZXNvbHZlKG91dERpciwgJ3BvcHVwLmh0bWwnKSk7XHJcbiAgICAgIGF3YWl0IGNvcHlGaWxlKHBhdGgucmVzb2x2ZShzdGF0aWNEaXIsICdzdHlsZXMuY3NzJyksIHBhdGgucmVzb2x2ZShvdXREaXIsICdzdHlsZXMuY3NzJykpO1xyXG4gICAgICBhd2FpdCBjb3B5RmlsZShwYXRoLnJlc29sdmUoc3RhdGljRGlyLCAncHJvbXB0LXRlbXBsYXRlLm1kJyksIHBhdGgucmVzb2x2ZShvdXREaXIsICdwcm9tcHQtdGVtcGxhdGUubWQnKSk7XHJcblxyXG4gICAgICBjb25zdCBpbWFnZXNEaXIgPSBwYXRoLnJlc29sdmUoc3RhdGljRGlyLCAnaW1hZ2VzJyk7XHJcbiAgICAgIGF3YWl0IGNvcHlEaXIoaW1hZ2VzRGlyLCBwYXRoLnJlc29sdmUob3V0RGlyLCAnaW1hZ2VzJykpO1xyXG5cclxuICAgICAgLy8gQ29weSBwcm9tcHRzIGRpcmVjdG9yeVxyXG4gICAgICBjb25zdCBwcm9tcHRzRGlyID0gcGF0aC5yZXNvbHZlKHJvb3QsICdzcmMnLCAncHJvbXB0cycpO1xyXG4gICAgICBhd2FpdCBjb3B5RGlyKHByb21wdHNEaXIsIHBhdGgucmVzb2x2ZShvdXREaXIsICdwcm9tcHRzJykpO1xyXG4gICAgfSxcclxuICB9O1xyXG59XHJcblxyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xyXG4gIHBsdWdpbnM6IFtcclxuICAgIHZhbGlkYXRlRW52UGx1Z2luKCksIC8vIFg1MUxBQlMtMTMwOiBWYWxpZGF0ZSBlbnYgdmFycyBiZWZvcmUgYnVpbGRcclxuICAgIGNvcHlFeHRlbnNpb25TdGF0aWMoKVxyXG4gIF0sXHJcbiAgLy8gWDUxTEFCUy03OTogVE9ETyAtIEFkZCBidWlsZCBzaXplIHZhbGlkYXRpb24gcGx1Z2luIChyZXF1aXJlcyBDSlMgb3IgZXh0ZXJuYWwgc2NyaXB0KVxyXG4gIGJ1aWxkOiB7XHJcbiAgICBvdXREaXI6ICdkaXN0JyxcclxuICAgIGVtcHR5T3V0RGlyOiB0cnVlLFxyXG4gICAgc291cmNlbWFwOiBwcm9jZXNzLmVudi5OT0RFX0VOViAhPT0gJ3Byb2R1Y3Rpb24nLCAvLyBYNTFMQUJTLTk4OiBPbmx5IGluIGRldmVsb3BtZW50XHJcbiAgICBjaHVua1NpemVXYXJuaW5nTGltaXQ6IDIwMDAsXHJcbiAgICByb2xsdXBPcHRpb25zOiB7XHJcbiAgICAgIGlucHV0OiB7XHJcbiAgICAgICAgYmFja2dyb3VuZDogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJ3NyYy9iYWNrZ3JvdW5kL2luZGV4LmpzJyksXHJcbiAgICAgICAgY29udGVudDogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJ3NyYy9jb250ZW50LmpzJyksXHJcbiAgICAgICAgdWk6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICdzcmMvdWkvaW5kZXguanMnKSxcclxuICAgICAgfSxcclxuICAgICAgb3V0cHV0OiB7XHJcbiAgICAgICAgZW50cnlGaWxlTmFtZXM6ICdbbmFtZV0uanMnLFxyXG4gICAgICAgIGNodW5rRmlsZU5hbWVzOiAnW25hbWVdLVtoYXNoXS5qcycsXHJcbiAgICAgICAgZm9ybWF0OiAnZXMnLFxyXG4gICAgICAgIC8vIFg1MUxBQlMtNzk6IFJlbW92ZWQgbWFudWFsQ2h1bmtzIC0gVml0ZSBhdXRvLXNwbGl0cyBvcHRpbWFsbHlcclxuICAgICAgfSxcclxuICAgIH0sXHJcbiAgfSxcclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBbVEsU0FBUyxjQUFjLGVBQWU7QUFDelMsT0FBTyxVQUFVO0FBQ2pCLFNBQVMsWUFBWSxVQUFVO0FBRi9CLElBQU0sbUNBQW1DO0FBUXpDLFNBQVMsb0JBQW9CO0FBQzNCLFNBQU87QUFBQSxJQUNMLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxJQUNQLGVBQWUsUUFBUTtBQUVyQixZQUFNLE9BQU8sT0FBTyxRQUFRO0FBQzVCLFlBQU0sU0FBUyxPQUFPLFVBQVUsUUFBUSxJQUFJO0FBQzVDLFlBQU0sTUFBTSxRQUFRLE1BQU0sUUFBUSxFQUFFO0FBRXBDLFlBQU0sa0JBQWtCO0FBQUEsUUFDdEI7QUFBQSxRQUNBO0FBQUEsTUFDRjtBQUVBLFlBQU0sc0JBQXNCO0FBQUEsUUFDMUI7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRjtBQUVBLFlBQU0sVUFBVSxDQUFDO0FBQ2pCLFlBQU0sY0FBYyxDQUFDO0FBRXJCLGlCQUFXLFdBQVcsaUJBQWlCO0FBQ3JDLGNBQU0sUUFBUSxJQUFJLE9BQU8sS0FBSyxRQUFR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
