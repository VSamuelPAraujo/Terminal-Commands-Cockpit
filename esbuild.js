const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");
const minify = process.argv.includes("--minify");

const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node20",
  // Prefer each dependency ESM entry. jsonc-parser UMD build does a runtime
  // require("./impl/format") that cannot resolve once bundled, which crashes the
  // extension host on activation; the ESM build bundles statically instead.
  mainFields: ["module", "main"],
  sourcemap: !minify,
  minify,
  logLevel: "info",
};

(async () => {
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
  } else {
    await esbuild.build(options);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
