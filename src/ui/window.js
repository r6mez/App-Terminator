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
    InternalChildren: ['appsListBox', 'searchEntry', 'typeFilterDropdown', 'sortDropdown'],
}, class TerminatorWindow extends Adw.ApplicationWindow {
    constructor(application) {
        super({ application });
        ensureCssLoaded();
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
            // Size descending; rows without a known size fall to the bottom.
            // Return -1/0/+1: GtkListBox marshals the return into a C int, so
            // raw byte differences (≥ 2^31) would overflow and flip the sign.
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
