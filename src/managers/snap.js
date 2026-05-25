import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio._promisify(Gio.SocketClient.prototype,
    'connect_async', 'connect_finish');
Gio._promisify(Gio.OutputStream.prototype,
    'write_all_async', 'write_all_finish');
Gio._promisify(Gio.OutputStream.prototype,
    'splice_async', 'splice_finish');

const SNAPD_SOCKET_PATH = '/run/snapd.socket';
const SNAPD_POLL_INTERVAL_MS = 500;

export function getSnapName(desktopFilePath) {
    const file = Gio.File.new_for_path(desktopFilePath);
    const [success, contents] = file.load_contents(null);
    if (!success) return null;

    const text = new TextDecoder().decode(contents);
    for (const line of text.split('\n')) {
        if (line.startsWith('X-SnapInstanceName=')) {
            return line.split('=')[1].trim();
        }
    }
    throw new Error('X-SnapInstanceName not found');
}

function sleep(ms) {
    return new Promise(resolve => {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            resolve();
            return GLib.SOURCE_REMOVE;
        });
    });
}

function parseHttpResponse(text) {
    const sep = text.indexOf('\r\n\r\n');
    if (sep < 0) throw new Error('Malformed snapd HTTP response');
    const status = parseInt(text.slice(0, sep).split(' ', 2)[1], 10);
    const bodyText = text.slice(sep + 4);
    return { status, body: bodyText ? JSON.parse(bodyText) : null };
}

async function snapdRequest(method, path, body = null) {
    const bodyBytes = body && new TextEncoder().encode(JSON.stringify(body));
    const head = new TextEncoder().encode([
        `${method} ${path} HTTP/1.0`,
        'Host: localhost',
        'X-Allow-Interaction: true',
        'Connection: close',
        ...(bodyBytes ? ['Content-Type: application/json', `Content-Length: ${bodyBytes.length}`] : []),
        '', '',
    ].join('\r\n'));

    const client = new Gio.SocketClient();
    const conn = await client.connect_async(Gio.UnixSocketAddress.new(SNAPD_SOCKET_PATH), null);
    const out = conn.get_output_stream();
    await out.write_all_async(head, GLib.PRIORITY_DEFAULT, null);
    if (bodyBytes) await out.write_all_async(bodyBytes, GLib.PRIORITY_DEFAULT, null);

    const sink = Gio.MemoryOutputStream.new_resizable();
    await sink.splice_async(
        conn.get_input_stream(),
        Gio.OutputStreamSpliceFlags.CLOSE_TARGET | Gio.OutputStreamSpliceFlags.CLOSE_SOURCE,
        GLib.PRIORITY_DEFAULT, null,
    );
    return parseHttpResponse(new TextDecoder().decode(sink.steal_as_bytes().toArray()));
}

async function waitForSnapdChange(changeId) {
    while (true) {
        const { body } = await snapdRequest('GET', `/v2/changes/${encodeURIComponent(changeId)}`);
        const result = body?.result;
        if (result?.ready) {
            if (result.status === 'Done') return;
            throw new Error(result.err || `Snap change ${result.status}`);
        }
        await sleep(SNAPD_POLL_INTERVAL_MS);
    }
}

export async function getDiskUsage(desktopFilePath) {
    try {
        const appName = getSnapName(desktopFilePath);
        if (!appName) return null;
        const { body } = await snapdRequest('GET', `/v2/snaps/${encodeURIComponent(appName)}`);
        const size = body?.result?.['installed-size'];
        return typeof size === 'number' ? size : null;
    } catch (e) {
        console.warn('Snap getDiskUsage failed:', e.message);
        return null;
    }
}

export async function uninstallSnap(desktopFilePath) {
    const appName = getSnapName(desktopFilePath);
    const { status, body } = await snapdRequest(
        'POST', `/v2/snaps/${encodeURIComponent(appName)}`, { action: 'remove' },
    );
    if (body?.type === 'async' && body.change) {
        await waitForSnapdChange(body.change);
        return;
    }
    throw new Error(body?.result?.message || `snapd returned HTTP ${status}`);
}
