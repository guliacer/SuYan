import path from "node:path";

export type LogStoragePathOptions = {
  isPackaged: boolean;
  execPath: string;
  userDataPath: string;
  portableExecutableDir?: string;
};

const logDirName = "logs";

export function resolveLogDirectory(options: LogStoragePathOptions): string {
  if (!options.isPackaged) {
    return path.join(options.userDataPath, logDirName);
  }

  const packagedRoot = options.portableExecutableDir?.trim()
    ? path.resolve(options.portableExecutableDir)
    : path.dirname(path.resolve(options.execPath));

  return path.join(packagedRoot, logDirName);
}
