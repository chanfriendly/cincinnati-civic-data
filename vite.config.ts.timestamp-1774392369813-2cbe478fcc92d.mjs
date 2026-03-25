// vite.config.ts
import { defineConfig, loadEnv } from "file:///sessions/nice-epic-einstein/mnt/cincinnati-civic-data/node_modules/vite/dist/node/index.js";
import react from "file:///sessions/nice-epic-einstein/mnt/cincinnati-civic-data/node_modules/@vitejs/plugin-react/dist/index.js";
var vite_config_default = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        // ── OpenRouter AI proxy ──────────────────────────────────────────────
        // The Authorization header is added here — never sent to the browser.
        // In production, the Cloudflare Worker handles this instead.
        "/api/openrouter": {
          target: "https://openrouter.ai",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/openrouter/, "/api"),
          headers: {
            Authorization: `Bearer ${env.OPENROUTER_API_KEY ?? ""}`,
            "HTTP-Referer": "http://localhost:5173",
            "X-Title": "Cincinnati Civic Platform (dev)"
          }
        },
        // ── US Census API proxy ───────────────────────────────────────────────
        // Appends the Census key via configure hook (searchParam injection).
        // In production, the Cloudflare Worker handles this.
        "/api/census": {
          target: "https://api.census.gov",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/census/, "/data"),
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              const url = new URL("https://api.census.gov" + proxyReq.path);
              url.searchParams.set("key", env.CENSUS_API_KEY ?? "");
              proxyReq.path = url.pathname + url.search;
            });
          }
        }
      }
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvc2Vzc2lvbnMvbmljZS1lcGljLWVpbnN0ZWluL21udC9jaW5jaW5uYXRpLWNpdmljLWRhdGFcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9zZXNzaW9ucy9uaWNlLWVwaWMtZWluc3RlaW4vbW50L2NpbmNpbm5hdGktY2l2aWMtZGF0YS92aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vc2Vzc2lvbnMvbmljZS1lcGljLWVpbnN0ZWluL21udC9jaW5jaW5uYXRpLWNpdmljLWRhdGEvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcsIGxvYWRFbnYgfSBmcm9tICd2aXRlJ1xuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0J1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoKHsgbW9kZSB9KSA9PiB7XG4gIC8vIExvYWQgQUxMIGVudiB2YXJzIChub3QganVzdCBWSVRFXyBwcmVmaXhlZCBvbmVzKSBzbyB3ZSBjYW4gdXNlXG4gIC8vIHNlbnNpdGl2ZSBrZXlzIGluIHRoZSBzZXJ2ZXItc2lkZSBwcm94eSB3aXRob3V0IGJ1bmRsaW5nIHRoZW0uXG4gIGNvbnN0IGVudiA9IGxvYWRFbnYobW9kZSwgcHJvY2Vzcy5jd2QoKSwgJycpXG5cbiAgcmV0dXJuIHtcbiAgICBwbHVnaW5zOiBbcmVhY3QoKV0sXG4gICAgc2VydmVyOiB7XG4gICAgICBwb3J0OiA1MTczLFxuICAgICAgcHJveHk6IHtcbiAgICAgICAgLy8gXHUyNTAwXHUyNTAwIE9wZW5Sb3V0ZXIgQUkgcHJveHkgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gICAgICAgIC8vIFRoZSBBdXRob3JpemF0aW9uIGhlYWRlciBpcyBhZGRlZCBoZXJlIFx1MjAxNCBuZXZlciBzZW50IHRvIHRoZSBicm93c2VyLlxuICAgICAgICAvLyBJbiBwcm9kdWN0aW9uLCB0aGUgQ2xvdWRmbGFyZSBXb3JrZXIgaGFuZGxlcyB0aGlzIGluc3RlYWQuXG4gICAgICAgICcvYXBpL29wZW5yb3V0ZXInOiB7XG4gICAgICAgICAgdGFyZ2V0OiAnaHR0cHM6Ly9vcGVucm91dGVyLmFpJyxcbiAgICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXG4gICAgICAgICAgcmV3cml0ZTogKHBhdGgpID0+IHBhdGgucmVwbGFjZSgvXlxcL2FwaVxcL29wZW5yb3V0ZXIvLCAnL2FwaScpLFxuICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHtlbnYuT1BFTlJPVVRFUl9BUElfS0VZID8/ICcnfWAsXG4gICAgICAgICAgICAnSFRUUC1SZWZlcmVyJzogJ2h0dHA6Ly9sb2NhbGhvc3Q6NTE3MycsXG4gICAgICAgICAgICAnWC1UaXRsZSc6ICdDaW5jaW5uYXRpIENpdmljIFBsYXRmb3JtIChkZXYpJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuXG4gICAgICAgIC8vIFx1MjUwMFx1MjUwMCBVUyBDZW5zdXMgQVBJIHByb3h5IFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuICAgICAgICAvLyBBcHBlbmRzIHRoZSBDZW5zdXMga2V5IHZpYSBjb25maWd1cmUgaG9vayAoc2VhcmNoUGFyYW0gaW5qZWN0aW9uKS5cbiAgICAgICAgLy8gSW4gcHJvZHVjdGlvbiwgdGhlIENsb3VkZmxhcmUgV29ya2VyIGhhbmRsZXMgdGhpcy5cbiAgICAgICAgJy9hcGkvY2Vuc3VzJzoge1xuICAgICAgICAgIHRhcmdldDogJ2h0dHBzOi8vYXBpLmNlbnN1cy5nb3YnLFxuICAgICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcbiAgICAgICAgICByZXdyaXRlOiAocGF0aCkgPT4gcGF0aC5yZXBsYWNlKC9eXFwvYXBpXFwvY2Vuc3VzLywgJy9kYXRhJyksXG4gICAgICAgICAgY29uZmlndXJlOiAocHJveHkpID0+IHtcbiAgICAgICAgICAgIHByb3h5Lm9uKCdwcm94eVJlcScsIChwcm94eVJlcSkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCB1cmwgPSBuZXcgVVJMKCdodHRwczovL2FwaS5jZW5zdXMuZ292JyArIHByb3h5UmVxLnBhdGgpXG4gICAgICAgICAgICAgIHVybC5zZWFyY2hQYXJhbXMuc2V0KCdrZXknLCBlbnYuQ0VOU1VTX0FQSV9LRVkgPz8gJycpXG4gICAgICAgICAgICAgIHByb3h5UmVxLnBhdGggPSB1cmwucGF0aG5hbWUgKyB1cmwuc2VhcmNoXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gIH1cbn0pXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQW9WLFNBQVMsY0FBYyxlQUFlO0FBQzFYLE9BQU8sV0FBVztBQUVsQixJQUFPLHNCQUFRLGFBQWEsQ0FBQyxFQUFFLEtBQUssTUFBTTtBQUd4QyxRQUFNLE1BQU0sUUFBUSxNQUFNLFFBQVEsSUFBSSxHQUFHLEVBQUU7QUFFM0MsU0FBTztBQUFBLElBQ0wsU0FBUyxDQUFDLE1BQU0sQ0FBQztBQUFBLElBQ2pCLFFBQVE7QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLE9BQU87QUFBQTtBQUFBO0FBQUE7QUFBQSxRQUlMLG1CQUFtQjtBQUFBLFVBQ2pCLFFBQVE7QUFBQSxVQUNSLGNBQWM7QUFBQSxVQUNkLFNBQVMsQ0FBQyxTQUFTLEtBQUssUUFBUSxzQkFBc0IsTUFBTTtBQUFBLFVBQzVELFNBQVM7QUFBQSxZQUNQLGVBQWUsVUFBVSxJQUFJLHNCQUFzQixFQUFFO0FBQUEsWUFDckQsZ0JBQWdCO0FBQUEsWUFDaEIsV0FBVztBQUFBLFVBQ2I7QUFBQSxRQUNGO0FBQUE7QUFBQTtBQUFBO0FBQUEsUUFLQSxlQUFlO0FBQUEsVUFDYixRQUFRO0FBQUEsVUFDUixjQUFjO0FBQUEsVUFDZCxTQUFTLENBQUMsU0FBUyxLQUFLLFFBQVEsa0JBQWtCLE9BQU87QUFBQSxVQUN6RCxXQUFXLENBQUMsVUFBVTtBQUNwQixrQkFBTSxHQUFHLFlBQVksQ0FBQyxhQUFhO0FBQ2pDLG9CQUFNLE1BQU0sSUFBSSxJQUFJLDJCQUEyQixTQUFTLElBQUk7QUFDNUQsa0JBQUksYUFBYSxJQUFJLE9BQU8sSUFBSSxrQkFBa0IsRUFBRTtBQUNwRCx1QkFBUyxPQUFPLElBQUksV0FBVyxJQUFJO0FBQUEsWUFDckMsQ0FBQztBQUFBLFVBQ0g7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
