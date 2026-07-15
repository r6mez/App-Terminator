/* main.js
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
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

import { TerminatorWindow } from './ui/window.js';

imports.package.localedir = GLib.build_filenamev([GLib.get_user_data_dir(), 'locale']);
pkg.initGettext();
pkg.initFormat();

export const TerminatorApplication = GObject.registerClass(
    class TerminatorApplication extends Adw.Application {
        constructor() {
            super({
                application_id: 'org.ramez.terminator',
                flags: Gio.ApplicationFlags.DEFAULT_FLAGS,
                resource_base_path: '/org/ramez/terminator'
            });

            const quit_action = new Gio.SimpleAction({name: 'quit'});
                quit_action.connect('activate', action => {
                this.quit();
            });
            this.add_action(quit_action);
            this.set_accels_for_action('app.quit', ['<control>q']);

            const show_about_action = new Gio.SimpleAction({name: 'about'});
            show_about_action.connect('activate', action => {
                const aboutParams = {
                    application_name: 'terminator',
                    application_icon: 'org.ramez.terminator',
                    developer_name: 'Ramez Medhat',
                    version: '0.1.0',
                    developers: [
                        'Ramez Medhat'
                    ],
                    translator_credits: _("translator-credits"),
                    copyright: '© 2026 Ramez Medhat'
                };
                const aboutDialog = new Adw.AboutDialog(aboutParams);
                aboutDialog.present(this.active_window);
            });
            this.add_action(show_about_action);

            this._addUriAction('github', 'https://github.com/r6mez/App-Terminator');
            this._addUriAction('donate', 'https://github.com/sponsors/r6mez');
        }

        _addUriAction(name, uri) {
            const action = new Gio.SimpleAction({ name });
            action.connect('activate', () => {
                Gtk.UriLauncher.new(uri).launch(this.active_window, null, null);
            });
            this.add_action(action);
        }

        vfunc_activate() {
            let {active_window} = this;

            if (!active_window)
                active_window = new TerminatorWindow(this);

            active_window.present();
        }
    }
);

export function main(argv) {
    const application = new TerminatorApplication();
    return application.runAsync(argv);
}
