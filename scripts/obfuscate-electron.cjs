const fs = require("node:fs");
const path = require("node:path");
const JavaScriptObfuscator = require("javascript-obfuscator");

function collectJsFiles(directoryPath, files = []) {
  if (!fs.existsSync(directoryPath)) {
    return files;
  }

  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const fullPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      collectJsFiles(fullPath, files);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js") && !entry.name.endsWith(".min.js")) {
      files.push(fullPath);
    }
  }

  return files;
}

function removeSourceMaps(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    return 0;
  }

  let removed = 0;

  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const fullPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      removed += removeSourceMaps(fullPath);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".map")) {
      fs.unlinkSync(fullPath);
      removed += 1;
    }
  }

  return removed;
}

function isSensitiveModule(filePath) {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  const markers = [
    "/clipboard/",
    "/batch/",
    "/ai/",
    "/runtimeintegrity",
    "/shareSourceFetchers",
    "/jimenghiddenfetch",
    "/promptanalysisservice",
    "/remoteaiclient",
    "/imagecompressor",
    "/videocompressor",
    "/deduplicatescanner",
    "/archiveStore",
    "/archivesstore",
    "/worddocumentimport",
    "/remotematerialdownload",
  ];

  return markers.some((marker) => normalized.includes(marker.toLowerCase()));
}

function createBaseObfuscatorOptions() {
  return {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.4,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: "hexadecimal",
    ignoreImports: true,
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    renameProperties: false,
    reservedNames: ["^__dirname$", "^__filename$", "^exports$", "^module$", "^require$", "^global$"],
    selfDefending: false,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 8,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayEncoding: ["base64"],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 1,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 2,
    stringArrayWrappersType: "function",
    stringArrayThreshold: 0.75,
    target: "node",
    transformObjectKeys: false,
    unicodeEscapeSequence: false,
  };
}

function createSensitiveObfuscatorOptions() {
  return {
    ...createBaseObfuscatorOptions(),
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.2,
    numbersToExpressions: true,
    splitStringsChunkLength: 5,
    stringArrayEncoding: ["rc4"],
    stringArrayWrappersCount: 2,
    stringArrayThreshold: 0.9,
  };
}

function obfuscateDirectory(targetDir) {
  const absoluteTargetDir = path.resolve(targetDir);

  if (!fs.existsSync(absoluteTargetDir)) {
    throw new Error(`Obfuscation target does not exist: ${absoluteTargetDir}`);
  }

  const removedMaps = removeSourceMaps(absoluteTargetDir);
  const jsFiles = collectJsFiles(absoluteTargetDir);
  const baseOptions = createBaseObfuscatorOptions();
  const sensitiveOptions = createSensitiveObfuscatorOptions();
  let obfuscatedCount = 0;
  let sensitiveCount = 0;

  for (const filePath of jsFiles) {
    const sourceCode = fs.readFileSync(filePath, "utf8");

    if (sourceCode.trim().length < 40) {
      continue;
    }

    const sensitive = isSensitiveModule(filePath);
    const options = sensitive ? sensitiveOptions : baseOptions;
    const result = JavaScriptObfuscator.obfuscate(sourceCode, options);
    fs.writeFileSync(filePath, result.getObfuscatedCode(), "utf8");
    obfuscatedCount += 1;
    if (sensitive) {
      sensitiveCount += 1;
    }
  }

  return {
    directory: absoluteTargetDir,
    obfuscatedCount,
    sensitiveCount,
    totalJsFiles: jsFiles.length,
    removedMaps,
  };
}

function main() {
  const targetDir = process.argv[2];

  if (!targetDir) {
    throw new Error("Usage: node scripts/obfuscate-electron.cjs <target-dir>");
  }

  const summary = obfuscateDirectory(targetDir);
  console.log(
    `Obfuscated ${summary.obfuscatedCount}/${summary.totalJsFiles} JS files in ${summary.directory}` +
      ` (sensitive ${summary.sensitiveCount})` +
      (summary.removedMaps > 0 ? ` (removed ${summary.removedMaps} source maps)` : ""),
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  obfuscateDirectory,
  removeSourceMaps,
  isSensitiveModule,
};
