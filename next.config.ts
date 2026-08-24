import type { NextConfig } from "next";
import { execSync } from "child_process";

// Wersja aplikacji = 1.{liczba commitów w repozytorium}
function resolveAppVersion(): string {
  if (process.env.NEXT_PUBLIC_APP_VERSION) {
    return process.env.NEXT_PUBLIC_APP_VERSION;
  }
  try {
    const count = execSync("git rev-list --count HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
    }).trim();
    if (/^\d+$/.test(count)) {
      return `1.${count}`;
    }
  } catch {
    // brak repozytorium git – fallback
  }
  return "1.0";
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: resolveAppVersion(),
  },
};

export default nextConfig;
