import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const FIELD_CODE_RE = /%[fFuUdDnNickvm%]/g;

function readDesktopKey(desktopFilePath, key) {
    const file = Gio.File.new_for_path(desktopFilePath);
    const [ok, contents] = file.load_contents(null);
    if (!ok) return null;

    const text = new TextDecoder().decode(contents);
    const prefix = `${key}=`;
    for (const line of text.split('\n')) {
        if (line.startsWith(prefix)) return line.slice(prefix.length).trim();
    }
    return null;
}

function expandHome(path) {
    if (path === '~') return GLib.get_home_dir();
    if (path.startsWith('~/')) return GLib.build_filenamev([GLib.get_home_dir(), path.slice(2)]);
    return path;
}

// Parse Exec= per the desktop entry spec and return the executable path
// (first argument), with field codes stripped and ~ expanded. Returns null
// if the line is missing, unparseable, or the executable is relative.
export function getExecBinary(desktopFilePath) {
    const exec = readDesktopKey(desktopFilePath, 'Exec');
    if (!exec) return null;

    const cleaned = exec.replace(FIELD_CODE_RE, m => (m === '%%' ? '%' : '')).trim();
    if (!cleaned) return null;

    let argv;
    try {
        [, argv] = GLib.shell_parse_argv(cleaned);
    } catch (_e) {
        return null;
    }
    if (!argv?.length) return null;

    const path = expandHome(argv[0]);
    return GLib.path_is_absolute(path) ? path : null;
}

export function isAppImage(desktopFilePath) {
    if (readDesktopKey(desktopFilePath, 'X-AppImage-Version')) return true;
    if (readDesktopKey(desktopFilePath, 'X-AppImage-BuildId')) return true;

    const binary = getExecBinary(desktopFilePath);
    return !!binary && binary.toLowerCase().endsWith('.appimage');
}

// Resolve the AppImage binary that should be deleted alongside the launcher.
// Returns null when the binary lives outside $HOME (we refuse to touch
// system-wide paths) or when the path can't be resolved.
export function resolveAppImageBinary(desktopFilePath) {
    const binary = getExecBinary(desktopFilePath);
    if (!binary) return null;

    const home = GLib.get_home_dir();
    if (!binary.startsWith(`${home}/`)) return null;

    const file = Gio.File.new_for_path(binary);
    try {
        const info = file.query_info(
            'standard::is-symlink,standard::symlink-target',
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            null,
        );
        if (info.get_is_symlink()) {
            const target = info.get_symlink_target();
            if (target) {
                const resolved = GLib.path_is_absolute(target)
                    ? target
                    : GLib.build_filenamev([GLib.path_get_dirname(binary), target]);
                if (resolved.startsWith(`${home}/`)) return resolved;
            }
        }
    } catch (_e) {
        return null;
    }
    return binary;
}

function deleteFile(path) {
    try {
        Gio.File.new_for_path(path).delete(null);
    } catch (e) {
        throw new Error(`Failed to delete ${path}: ${e.message}`);
    }
}

export async function getDiskUsage(desktopFilePath) {
    const binary = resolveAppImageBinary(desktopFilePath);
    if (!binary) return null;
    try {
        const info = Gio.File.new_for_path(binary).query_info(
            'standard::size',
            Gio.FileQueryInfoFlags.NONE,
            null,
        );
        return info.get_size();
    } catch (e) {
        console.warn('AppImage getDiskUsage failed:', e.message);
        return null;
    }
}

export async function uninstallAppImage(desktopFilePath, { removeBinary = false, binaryPath = null } = {}) {
    if (removeBinary && binaryPath) deleteFile(binaryPath);
    deleteFile(desktopFilePath);
    return true;
}
