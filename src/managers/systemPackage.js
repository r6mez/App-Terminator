import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const PACKAGEKIT_BUS_NAME = 'org.freedesktop.PackageKit';
const PACKAGEKIT_OBJECT_PATH = '/org/freedesktop/PackageKit';
const PACKAGEKIT_INTERFACE = 'org.freedesktop.PackageKit';
const TRANSACTION_INTERFACE = 'org.freedesktop.PackageKit.Transaction';

const DEFAULT_TIMEOUT = -1;
const DEFAULT_CANCELLABLE = null;

function dbusCallAsync(connection, busName, objectPath, iface, method, params, replyType) {
    return new Promise((resolve, reject) => {
        connection.call(
            busName,
            objectPath,
            iface,
            method,
            params,
            replyType,
            Gio.DBusCallFlags.NONE,
            DEFAULT_TIMEOUT,
            DEFAULT_CANCELLABLE,
            (conn, result) => {
                try {
                    resolve(conn.call_finish(result));
                } catch (e) {
                    reject(e);
                }
            }
        );
    });
}

async function isPackageKitAvailable() {
    try {
        const connection = Gio.bus_get_sync(Gio.BusType.SYSTEM, null);

        const startReply = await dbusCallAsync(
            connection,
            'org.freedesktop.DBus',
            '/org/freedesktop/DBus',
            'org.freedesktop.DBus',
            'StartServiceByName',
            new GLib.Variant('(su)', [PACKAGEKIT_BUS_NAME, 0]),
            new GLib.VariantType('(u)')
        );

        // 1 = DBUS_START_REPLY_SUCCESS, 2 = DBUS_START_REPLY_ALREADY_RUNNING
        const code = startReply.get_child_value(0).get_uint32();
        return code === 1 || code === 2;
    } catch (e) {
        console.warn('PackageKit availability check failed:', e.message);
        return false;
    }
}

async function createTransaction() {
    const connection = Gio.bus_get_sync(Gio.BusType.SYSTEM, null);

    const result = await dbusCallAsync(
        connection,
        PACKAGEKIT_BUS_NAME,
        PACKAGEKIT_OBJECT_PATH,
        PACKAGEKIT_INTERFACE,
        'CreateTransaction',
        null,
        new GLib.VariantType('(o)')
    );

    const transactionPath = result.get_child_value(0).get_string()[0];

    // allows interactive authentication
    await dbusCallAsync(
        connection,
        PACKAGEKIT_BUS_NAME,
        transactionPath,
        TRANSACTION_INTERFACE,
        'SetHints',
        new GLib.Variant('(as)', [['interactive=true']]),
        null
    );

    return transactionPath;
}

// Run a PackageKit transaction method, collecting data from `dataSignal` via
// `onData` (return a value to store as the result; return undefined to ignore).
// Resolves with the collected result when `Finished` fires, or with the value
// returned by `onFinished(exitCode, currentResult)` if provided. Rejects on
// `ErrorCode` or if the initial method call fails.
async function runTransaction({ method, args, dataSignal, onData, onFinished }) {
    const connection = Gio.bus_get_sync(Gio.BusType.SYSTEM, null);
    const transactionPath = await createTransaction();

    return new Promise((resolve, reject) => {
        const subs = [];
        const cleanup = () => subs.forEach(id => connection.signal_unsubscribe(id));
        const sub = (name, cb) => subs.push(connection.signal_subscribe(
            PACKAGEKIT_BUS_NAME, TRANSACTION_INTERFACE, name,
            transactionPath, null, Gio.DBusSignalFlags.NONE, cb,
        ));

        let result;
        if (dataSignal) {
            sub(dataSignal, (_c, _s, _p, _i, _sig, params) => {
                try {
                    const v = onData(params);
                    if (v !== undefined) result = v;
                } catch (e) {
                    console.warn(`Error parsing ${dataSignal} signal:`, e.message);
                }
            });
        }
        sub('Finished', (_c, _s, _p, _i, _sig, params) => {
            cleanup();
            if (onFinished) {
                try {
                    resolve(onFinished(params.get_child_value(0).get_uint32(), result));
                } catch (e) {
                    reject(e);
                }
            } else {
                resolve(result);
            }
        });
        sub('ErrorCode', (_c, _s, _p, _i, _sig, params) => {
            cleanup();
            reject(new Error(params.get_child_value(1).get_string()[0]));
        });

        dbusCallAsync(
            connection, PACKAGEKIT_BUS_NAME, transactionPath,
            TRANSACTION_INTERFACE, method, args, null,
        ).catch(err => { cleanup(); reject(err); });
    });
}

async function resolvePackageFromDesktop(desktopFilePath) {
    const packageId = await runTransaction({
        method: 'SearchFiles',
        args: new GLib.Variant('(tas)', [0, [desktopFilePath]]),
        dataSignal: 'Package',
        onData: params => params.get_child_value(1).get_string()[0],
    });
    if (!packageId) throw new Error('Could not resolve package from desktop file');
    return packageId;
}

async function removePackageById(packageId) {
    return runTransaction({
        method: 'RemovePackages',
        args: new GLib.Variant('(tasbb)', [0, [packageId], true, true]),
        onFinished: exitCode => {
            if (exitCode === 1) return true; // PK_EXIT_ENUM_SUCCESS
            throw new Error(`Package removal failed with exit code: ${exitCode}`);
        },
    });
}

export async function getDiskUsage(desktopFilePath) {
    try {
        const packageId = await resolvePackageFromDesktop(desktopFilePath);
        return await runTransaction({
            method: 'GetDetails',
            args: new GLib.Variant('(as)', [[packageId]]),
            dataSignal: 'Details',
            onData: params => {
                const dict = params.get_child_value(0);
                if (dict.get_type_string() !== 'a{sv}') return;
                const sz = dict.lookup_value('size', GLib.VariantType.new('t'));
                return sz ? Number(sz.get_uint64()) : undefined;
            },
        });
    } catch (e) {
        console.warn('getDiskUsage failed:', e.message);
        return null;
    }
}

export async function uninstallSystemPackage(desktopFilePath) {
    if (!(await isPackageKitAvailable())) {
        throw new Error('PackageKit is not available on this system. Install and enable the "packagekit" service to uninstall system packages.');
    }
    const packageId = await resolvePackageFromDesktop(desktopFilePath);
    await removePackageById(packageId);
}
