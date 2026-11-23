import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const envValue = (name: string, fallback: string) =>
    process.env[name] ?? fileEnv[name] ?? fallback;

  return {
    base: envValue("GITHUB_PAGES_BASE_PATH", "/"),
    plugins: [react()],
    define: {
      "process.env.NEXT_PUBLIC_CASHX_CHAIN_ID": JSON.stringify(
        envValue("NEXT_PUBLIC_CASHX_CHAIN_ID", "369"),
      ),
      "process.env.NEXT_PUBLIC_CASHX_CONTRACT_ADDRESS": JSON.stringify(
        envValue(
          "NEXT_PUBLIC_CASHX_CONTRACT_ADDRESS",
          "0x744351E2846498D040B649D694CAB21f32f14AFe",
        ),
      ),
      "process.env.NEXT_PUBLIC_CASHX_DEPLOYMENT_BLOCK": JSON.stringify(
        envValue("NEXT_PUBLIC_CASHX_DEPLOYMENT_BLOCK", "27306495"),
      ),
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
