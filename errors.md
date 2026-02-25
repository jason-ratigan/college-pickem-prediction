
Prof. Ratigan@RatiganPC MINGW64 /d/Development/college-pickem (main)
$ npm run build

> college-pickem-monorepo@1.0.0 build
> npm run build --workspace=shared && npm run build --workspace=client && npm run build --workspace=server


> @college-pickem/shared@1.0.0 build
> tsc


> build
> tsc && vite build

The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.
vite v5.4.20 building for production...
transforming (1) index.html[baseline-browser-mapping] The data in this module is over two months old.  To ensure accurate Baseline data, please update: `npm i baseline-browser-mapping@latest -D`
✓ 1682 modules transformed.
../dist/client/index.html                   2.20 kB │ gzip:   0.86 kB
../dist/client/assets/index-BwBAWc9l.css   72.59 kB │ gzip:  12.57 kB
../dist/client/assets/index-qFS4Eael.js   500.81 kB │ gzip: 145.09 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 3.10s

> build
> tsc --outDir ./dist


Prof. Ratigan@RatiganPC MINGW64 /d/Development/college-pickem (main)