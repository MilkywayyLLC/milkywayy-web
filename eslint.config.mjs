import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "reference/**",
    "supabase/functions/**",
    // ffmpeg.wasm, copied from node_modules at build (scripts/copy-ffmpeg.mjs).
    "public/ffmpeg/**",
  ]),
]);

export default eslintConfig;
