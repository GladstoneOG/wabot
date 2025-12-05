import fs from "fs";
import type { NextConfig } from "next";

const projectRoot = process.cwd();
const projectRealPathOriginal = fs.realpathSync(projectRoot);

const strippedPrefixPath = projectRealPathOriginal.replace(/^\\\\\?\\/, "");
const standardUncPath = projectRealPathOriginal.startsWith("\\\\?\\UNC\\")
  ? `\\\\${projectRealPathOriginal.slice(8)}`
  : strippedPrefixPath;

const aliasMap: Record<string, string> = {
  [projectRealPathOriginal]: projectRoot,
};

if (standardUncPath && standardUncPath !== projectRealPathOriginal) {
  aliasMap[standardUncPath] = projectRoot;
}

if (
  strippedPrefixPath &&
  strippedPrefixPath !== standardUncPath &&
  strippedPrefixPath !== projectRealPathOriginal
) {
  aliasMap[strippedPrefixPath] = projectRoot;
}

const remapPath = (value: string) => {
  for (const [from, to] of Object.entries(aliasMap)) {
    if (value.startsWith(from)) {
      return to + value.slice(from.length);
    }
  }
  return value;
};

const originalRealpathSync = fs.realpathSync;
fs.realpathSync = ((
  path: fs.PathLike,
  options?: fs.ObjectEncodingOptions | BufferEncoding | null
) => {
  const result = options
    ? originalRealpathSync(path, options)
    : originalRealpathSync(path);
  return typeof result === "string"
    ? (remapPath(result) as ReturnType<typeof originalRealpathSync>)
    : result;
}) as typeof fs.realpathSync;

const originalRealpathSyncNative = (
  originalRealpathSync as typeof fs.realpathSync & {
    native?: typeof fs.realpathSync;
  }
).native;
if (typeof originalRealpathSyncNative === "function") {
  (
    fs.realpathSync as typeof fs.realpathSync & {
      native?: typeof fs.realpathSync;
    }
  ).native = ((
    path: fs.PathLike,
    options?: fs.ObjectEncodingOptions | BufferEncoding | null
  ) => {
    const result = options
      ? originalRealpathSyncNative(path, options)
      : originalRealpathSyncNative(path);
    return typeof result === "string"
      ? (remapPath(result) as ReturnType<typeof originalRealpathSyncNative>)
      : result;
  }) as typeof fs.realpathSync;
}

if (fs.promises?.realpath) {
  const originalRealpathPromise = fs.promises.realpath.bind(fs.promises);
  fs.promises.realpath = (async (
    path: fs.PathLike,
    options?: fs.ObjectEncodingOptions | BufferEncoding | null
  ) => {
    const resolved = await originalRealpathPromise(
      path,
      options as fs.ObjectEncodingOptions
    );
    return typeof resolved === "string" ? remapPath(resolved) : resolved;
  }) as typeof fs.promises.realpath;
}

const nextConfig: NextConfig = {
  reactCompiler: true,
  outputFileTracingRoot: projectRoot,
  turbopack: {
    resolveAlias: aliasMap,
  },
};

export default nextConfig;
