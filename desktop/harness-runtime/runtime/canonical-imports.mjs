import { realpathSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Windows paths are case-insensitive, but ESM URLs are not. Harness's plugin
// resolver can return a different drive/path casing from Node's startup import.
// Canonicalize before either import so settings and boot share the same module.
if (process.platform === 'win32') registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    if (!result.url.startsWith('file:')) return result;
    const url = new URL(result.url);
    const canonical = pathToFileURL(realpathSync.native(fileURLToPath(url)));
    canonical.search = url.search;
    canonical.hash = url.hash;
    return { ...result, url: canonical.href };
  },
});