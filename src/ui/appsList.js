import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import { uninstallApp, classifyAppType, getAppTypeLabel, getAppDiskUsage } from '../managers/index.js';
import { preserveScrollDuring } from './scroll.js';

// Extra desktop-entry roots that may be missing from XDG_DATA_DIRS in some environments (notably WSL)
const EXTRA_APP_DIRS = [
    '/var/lib/snapd/desktop/applications',
    '/var/lib/flatpak/exports/share/applications',
    GLib.build_filenamev([GLib.get_home_dir(), '.local/share/flatpak/exports/share/applications']),
];

function* iterDesktopFiles(dir) {
    const dirFile = Gio.File.new_for_path(dir);
    let enumerator;
    
    try {
        enumerator = dirFile.enumerate_children(
            'standard::name',
            Gio.FileQueryInfoFlags.NONE,
            null
        );
    } catch {
        return;
    }

    try {
        let info;
        while ((info = enumerator.next_file(null)) !== null) {
            const name = info.get_name();
            if (name.endsWith('.desktop')) {
                yield GLib.build_filenamev([dir, name]);
            }
        }
    } finally {
        enumerator.close(null);
    }
}

function loadApps() {
    const apps = Gio.AppInfo.get_all();
    const byId = new Map();
    for (const app of apps) {
        const id = app.get_id();
        if (id) byId.set(id, app);
    }

    for (const dir of EXTRA_APP_DIRS) {
        const paths = iterDesktopFiles(dir);
        for (const path of paths) {
            const app = GioUnix.DesktopAppInfo.new_from_filename(path);
            const id = app?.get_id();
            if (id && !byId.has(id)) byId.set(id, app);
        }
    }

    const appList = [...byId.values()];
    const cleanedAppList = appList.filter(app => app.should_show())
                                    .sort((a, b) =>
                                        (a.get_display_name() ?? '').toLowerCase()
                                            .localeCompare((b.get_display_name() ?? '').toLowerCase())
                                    );

    return cleanedAppList;
}

export function populateAppList(listBox) {
    const apps = loadApps();

    apps.forEach(app => {
        const displayName = app.get_display_name();
        const appId = app.get_id();
        const desktopPath = app.get_filename();
        const appType = classifyAppType(desktopPath);

        const row = new Adw.ActionRow({
            title: GLib.markup_escape_text(displayName ?? '', -1),
            subtitle: GLib.markup_escape_text(appId ?? '', -1)
        });

        row.appType = appType;
        row.searchText = `${displayName ?? ''} ${appId ?? ''}`.toLowerCase();

        const icon = new Gtk.Image({
            gicon: app.get_icon(),
            pixel_size: 32
        });

        row.add_prefix(icon);

        const sizeLabel = new Gtk.Label({
            label: '…',
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label', 'app-disk-usage'],
        });
        row.add_suffix(sizeLabel);

        getAppDiskUsage(appType, desktopPath).then(bytes => {
            sizeLabel.set_label(bytes != null ? GLib.format_size(bytes) : '');
        }).catch(() => sizeLabel.set_label(''));

        const badge = new Gtk.Label({
            label: getAppTypeLabel(appType),
            valign: Gtk.Align.CENTER,
            css_classes: ['app-type-badge', `type-${appType}`]
        });
        row.add_suffix(badge);

        const uninstallButton = new Gtk.Button({
            icon_name: 'user-trash-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['destructive-action']
        });

        uninstallButton.connect('clicked', () => {
            uninstallApp(
                listBox.get_root(),
                displayName,
                appId,
                desktopPath,
                () => preserveScrollDuring(listBox, () => listBox.remove(row))
            );
        });

        row.add_suffix(uninstallButton);
        listBox.append(row);
    });
}
