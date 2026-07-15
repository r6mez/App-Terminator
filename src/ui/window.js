/* window.js
 *
 * Copyright 2026 Unknown
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

import { populateAppList } from './appsList.js';
import { AppType } from '../managers/index.js';

const FILTER_INDEX_TO_TYPE = [
    null,
    AppType.FLATPAK,
    AppType.SNAP,
    AppType.APPIMAGE,
    AppType.SYSTEM_PACKAGE,
    AppType.USER_LOCAL,
    AppType.UNKNOWN,
];

let cssLoaded = false;
function ensureCssLoaded() {
    if (cssLoaded) return;
    const provider = new Gtk.CssProvider();
    provider.load_from_resource('/org/ramez/terminator/style.css');
    Gtk.StyleContext.add_provider_for_display(
        Gdk.Display.get_default(),
        provider,
        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
    );
    cssLoaded = true;
}

export const TerminatorWindow = GObject.registerClass({
    GTypeName: 'TerminatorWindow',
    Template: 'resource:///org/ramez/terminator/window.ui',
    InternalChildren: ['appsListBox', 'searchEntry', 'typeFilterDropdown', 'sortDropdown',
                       'menuButton', 'filterLabel', 'sortLabel'],
}, class TerminatorWindow extends Adw.ApplicationWindow {
    constructor(application) {
        super({ application });
        ensureCssLoaded();

        this.title = _('Terminator');
        this._searchEntry.placeholder_text = _('Search applications');
        this._filterLabel.label = _('Filter:');
        this._sortLabel.label = _('Sort:');
        this._menuButton.tooltip_text = _('Main Menu');

        const filterStrings = [_('All'), 'Flatpak', 'Snap', 'AppImage', _('System'), _('User'), _('Unknown')];
        this._typeFilterDropdown.model = Gtk.StringList.new(filterStrings);
        this._typeFilterDropdown.tooltip_text = _('Filter by type');

        this._sortDropdown.model = Gtk.StringList.new([_('Name'), _('Size')]);
        this._sortDropdown.tooltip_text = _('Sort');

        const menu = new Gio.Menu();
        menu.append(_('_Preferences'), 'app.preferences');
        menu.append(_('_Keyboard Shortcuts'), 'app.shortcuts');
        menu.append(_('View on _GitHub'), 'app.github');
        menu.append(_('_Donate'), 'app.donate');
        menu.append(_('_About Terminator'), 'app.about');
        this._menuButton.menu_model = menu;

        populateAppList(this._appsListBox, () => this._appsListBox.invalidate_sort());

        this._appsListBox.set_filter_func(row => this._rowMatches(row));
        this._appsListBox.set_sort_func((a, b) => this._compareRows(a, b));

        this._searchEntry.connect('search-changed', () => {
            this._appsListBox.invalidate_filter();
        });
        this._typeFilterDropdown.connect('notify::selected', () => {
            this._appsListBox.invalidate_filter();
        });
        this._sortDropdown.connect('notify::selected', () => {
            this._appsListBox.invalidate_sort();
        });
    }

    _compareRows(a, b) {
        const byName = (a.displayName ?? '').localeCompare(b.displayName ?? '', undefined, { sensitivity: 'base' });
        if (this._sortDropdown.get_selected() === 1) {
            const sa = a.diskUsage ?? -1;
            const sb = b.diskUsage ?? -1;
            if (sa !== sb) return sa > sb ? -1 : 1;
        }
        return byName;
    }

    _rowMatches(row) {
        const selectedIdx = this._typeFilterDropdown.get_selected();
        const wantedType = FILTER_INDEX_TO_TYPE[selectedIdx] ?? null;
        if (wantedType && row.appType !== wantedType) return false;

        const query = (this._searchEntry.get_text() ?? '').trim().toLowerCase();
        if (!query) return true;
        return (row.searchText ?? '').includes(query);
    }
});
