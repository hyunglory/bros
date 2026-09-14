// Never inherit DB, R2, provider, proxy credentials, NODE_OPTIONS or DEBUG into Chromium.
export function browserLaunchEnvironment(): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const key of [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "LANG",
    "LC_ALL",
    "TZ",
    "TMPDIR",
    "TMP",
    "TEMP",
    "DISPLAY",
    "WAYLAND_DISPLAY",
    "XDG_RUNTIME_DIR",
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "USERPROFILE",
    "LOCALAPPDATA",
    "APPDATA",
  ]) {
    if (process.env[key] !== undefined) safe[key] = process.env[key];
  }
  return safe;
}
