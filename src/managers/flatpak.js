import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio._promisify(Gio.Subprocess.prototype, 'wait_async', 'wait_finish');
Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async', 'communicate_utf8_finish');

// Prefer X-Flatpak= from the desktop file when present: filename-based
// inference breaks for multi-launcher apps like LibreOffice, whose desktop
// files are e.g. `org.libreoffice.LibreOffice.base.desktop` but whose actual
// Flatpak app id is `org.libreoffice.LibreOffice`.
function getFlatpakAppId(desktopFilePath) {
    const file = Gio.File.new_for_path(desktopFilePath);
    const [ok, contents] = file.load_contents(null);
    if (ok) {
        const text = new TextDecoder().decode(contents);
        for (const line of text.split('\n')) {
            if (line.startsWith('X-Flatpak=')) {
                const value = line.slice('X-Flatpak='.length).trim();
                if (value) return value;
            }
        }
    }
    const basename = GLib.path_get_basename(desktopFilePath);
    return basename.replace('.desktop', '');
}

async function runSubprocess(args) {
    const flags = Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE;
    const subprocess = Gio.Subprocess.new(args, flags);
    await subprocess.wait_async(null);
    return subprocess.get_successful();
}

function getFlatpakScope(desktopFilePath) {
    const userPrefix = GLib.build_filenamev([GLib.get_home_dir(), '.local/share/flatpak/']);
    return desktopFilePath.startsWith(userPrefix) ? '--user' : '--system';
}

async function captureStdout(args) {
    const flags = Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE;
    const subprocess = Gio.Subprocess.new(args, flags);
    const [stdout] = await subprocess.communicate_utf8_async(null, null);
    if (!subprocess.get_successful()) return null;
    return stdout.trim();
}

// Sums the deploy directory (app + per-app data), not shared runtimes —
// `flatpak info --show-size` includes runtime sizes which inflates the number.
export async function getDiskUsage(desktopFilePath) {
    const appId = getFlatpakAppId(desktopFilePath);
    const scope = getFlatpakScope(desktopFilePath);
    try {
        const location = await captureStdout(['flatpak', 'info', '--show-location', scope, appId]);
        if (!location) return null;
        const duOutput = await captureStdout(['du', '-sb', location]);
        if (!duOutput) return null;
        const bytes = parseInt(duOutput.split(/\s+/)[0], 10);
        return Number.isFinite(bytes) ? bytes : null;
    } catch (e) {
        console.warn('Flatpak getDiskUsage failed:', e.message);
        return null;
    }
}

export async function uninstallFlatpak(desktopFilePath) {
    const appId = getFlatpakAppId(desktopFilePath);
    const scope = getFlatpakScope(desktopFilePath);

    const success = await runSubprocess(['flatpak', 'uninstall', scope, '-y', appId]);
    if (success) return true;

    throw new Error('Flatpak uninstall failed. The app may not be installed.');
}
