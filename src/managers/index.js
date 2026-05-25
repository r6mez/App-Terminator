import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix?version=2.0';
import GLib from 'gi://GLib';
import Adw from 'gi://Adw';

import { uninstallSnap, getDiskUsage as snapDiskUsage } from './snap.js';
import { uninstallFlatpak, getDiskUsage as flatpakDiskUsage } from './flatpak.js';
import { uninstallSystemPackage, getDiskUsage as systemPackageDiskUsage } from './systemPackage.js';
import { uninstallUserLocal } from './userLocal.js';
import { uninstallAppImage, isAppImage, resolveAppImageBinary, getDiskUsage as appImageDiskUsage } from './appImage.js';

export const AppType = {
    SYSTEM_PACKAGE: 'system-package',
    FLATPAK: 'flatpak',
    SNAP: 'snap',
    USER_LOCAL: 'user-local',
    APPIMAGE: 'appimage',
    UNKNOWN: 'unknown'
};

const APP_TYPE_LABELS = {
    [AppType.SYSTEM_PACKAGE]: 'System',
    [AppType.FLATPAK]: 'Flatpak',
    [AppType.SNAP]: 'Snap',
    [AppType.USER_LOCAL]: 'User',
    [AppType.APPIMAGE]: 'AppImage',
    [AppType.UNKNOWN]: 'Unknown',
};

export function getAppTypeLabel(type) {
    return APP_TYPE_LABELS[type] ?? 'Unknown';
}

const UNINSTALLERS = {
    [AppType.SYSTEM_PACKAGE]: uninstallSystemPackage,
    [AppType.FLATPAK]: uninstallFlatpak,
    [AppType.SNAP]: uninstallSnap,
    [AppType.USER_LOCAL]: uninstallUserLocal,
};

const DISK_USAGE_LOOKUPS = {
    [AppType.SYSTEM_PACKAGE]: systemPackageDiskUsage,
    [AppType.FLATPAK]: flatpakDiskUsage,
    [AppType.SNAP]: snapDiskUsage,
    [AppType.APPIMAGE]: appImageDiskUsage,
};

export async function getAppDiskUsage(appType, desktopFilePath) {
    const lookup = DISK_USAGE_LOOKUPS[appType];
    if (!lookup) return null;
    return lookup(desktopFilePath);
}

export function classifyAppType(desktopFilePath) {
    if (!desktopFilePath) return AppType.UNKNOWN;
    const info = GioUnix.DesktopAppInfo.new_from_filename(desktopFilePath);
    if (!info) return AppType.UNKNOWN;

    if (info.has_key('X-Flatpak')) return AppType.FLATPAK;
    if (info.has_key('X-SnapInstanceName')) return AppType.SNAP;
    if (isAppImage(desktopFilePath)) return AppType.APPIMAGE;

    const userDir = GLib.build_filenamev([GLib.get_user_data_dir(), 'applications']);
    if (desktopFilePath.startsWith(userDir)) return AppType.USER_LOCAL;

    return AppType.SYSTEM_PACKAGE;
}

function showResultDialog(parentWindow, success, appName, error = null) {
    const dialog = new Adw.MessageDialog({
        transient_for: parentWindow,
        heading: success ? "Uninstall Complete" : "Uninstall Failed",
        body: success
            ? `${appName} has been successfully uninstalled.`
            : `Could not uninstall ${appName}: ${error.message}`,
    });
    dialog.add_response("ok", "OK");
    dialog.present();
}

function uninstallAppImageFlow(parentWindow, appName, desktopFilePath, onSuccess) {
    const binaryPath = resolveAppImageBinary(desktopFilePath);

    const lines = [
        `Uninstall ${appName}?`,
        '',
        `Launcher: ${desktopFilePath}`,
    ];
    if (binaryPath) lines.push(`AppImage: ${binaryPath}`);
    else lines.push('AppImage binary could not be located in your home directory; only the launcher will be removed.');

    const dialog = new Adw.MessageDialog({
        transient_for: parentWindow,
        heading: "Uninstall AppImage",
        body: lines.join('\n'),
    });

    dialog.add_response("cancel", "Cancel");
    dialog.add_response("launcher", "Remove launcher only");
    if (binaryPath) {
        dialog.add_response("both", "Remove launcher and AppImage");
        dialog.set_response_appearance("both", Adw.ResponseAppearance.DESTRUCTIVE);
    } else {
        dialog.set_response_appearance("launcher", Adw.ResponseAppearance.DESTRUCTIVE);
    }

    dialog.connect('response', async (_self, response) => {
        if (response === 'cancel') return;
        const removeBinary = response === 'both';
        try {
            await uninstallAppImage(desktopFilePath, { removeBinary, binaryPath });
            if (onSuccess) onSuccess();
            showResultDialog(parentWindow, true, appName);
        } catch (e) {
            console.error("AppImage uninstall failed:", e);
            showResultDialog(parentWindow, false, appName, e);
        }
    });

    dialog.present();
}

export function uninstallApp(parentWindow, appName, desktopId, desktopFilePath, onSuccess = null) {
    console.log(`Requesting uninstall for: ${desktopId} (${desktopFilePath})`);

    const appType = classifyAppType(desktopFilePath);
    console.log(`Detected app type: ${appType}`);

    if (appType === AppType.UNKNOWN || !desktopFilePath) {
        const dialog = new Adw.MessageDialog({
            transient_for: parentWindow,
            heading: "Cannot Uninstall",
            body: `Cannot determine how to uninstall ${appName}.`,
        });
        dialog.add_response("ok", "OK");
        dialog.present();
        return;
    }

    if (appType === AppType.APPIMAGE) {
        uninstallAppImageFlow(parentWindow, appName, desktopFilePath, onSuccess);
        return;
    }

    const dialogBody = appType === AppType.USER_LOCAL
        ? `Are you sure you want to uninstall ${appName}? This will remove the launcher, but associated files may remain in your home directory.`
        : `Are you sure you want to uninstall ${appName}?`;

    const dialog = new Adw.MessageDialog({
        transient_for: parentWindow,
        heading: "Uninstall Request",
        body: dialogBody,
    });

    dialog.add_response("cancel", "Cancel");
    dialog.add_response("remove", "Remove");
    dialog.set_response_appearance("remove", Adw.ResponseAppearance.DESTRUCTIVE);

    dialog.connect('response', async (self, response) => {
        if (response !== 'remove') return;

        try {
            await UNINSTALLERS[appType](desktopFilePath);
            console.log(`Successfully uninstalled ${appName}`);
            if (onSuccess) onSuccess();
            showResultDialog(parentWindow, true, appName);
        } catch (e) {
            console.error("Uninstall failed:", e);
            showResultDialog(parentWindow, false, appName, e);
        }
    });

    dialog.present();
}
