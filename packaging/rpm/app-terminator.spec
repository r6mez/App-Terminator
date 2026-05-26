Name:           app-terminator
Version:        0.2.0
Release:        1%{?dist}
Summary:        Unified manager for installed applications (system, Flatpak, Snap, AppImage)

License:        GPL-3.0-or-later
URL:            https://github.com/r6mez/App-Terminator
Source0:        https://github.com/r6mez/App-Terminator/archive/refs/tags/v%{version}.tar.gz#/%{name}-%{version}.tar.gz

BuildArch:      noarch

BuildRequires:  meson >= 1.0.0
BuildRequires:  ninja-build
BuildRequires:  gettext
BuildRequires:  gjs
BuildRequires:  appstream
BuildRequires:  desktop-file-utils
BuildRequires:  pkgconfig(gtk4)
BuildRequires:  pkgconfig(libadwaita-1)
BuildRequires:  pkgconfig(gio-2.0)

Requires:       gjs
Requires:       gtk4
Requires:       libadwaita
Requires:       glib2
Requires:       PackageKit

%description
Terminator is a GTK4/libadwaita application that lists installed apps from
multiple Linux packaging systems — system packages (via PackageKit), Flatpak,
Snap, AppImage, and user-local desktop entries — in a single interface,
and lets you uninstall any of them.

%prep
%autosetup -n App-Terminator-%{version}

%build
%meson
%meson_build

%install
%meson_install

%check
%meson_test || true

%files
%license COPYING
%doc README.md
%{_bindir}/org.ramez.terminator
%{_datadir}/applications/org.ramez.terminator.desktop
%{_datadir}/metainfo/org.ramez.terminator.metainfo.xml
%{_datadir}/glib-2.0/schemas/org.ramez.terminator.gschema.xml
%{_datadir}/icons/hicolor/*/apps/org.ramez.terminator*
%{_datadir}/dbus-1/services/org.ramez.terminator.service
%{_datadir}/terminator/

%changelog
* Tue May 26 2026 Ramez Medhat <iramezdev@gmail.com> - 0.2.0-1
- Show per-app disk usage in the apps list, with sorting by name or size.
- Persistent toolbar and broader size lookups (snap, flatpak, WSL paths).

* Mon May 11 2026 Ramez Medhat <iramezdev@gmail.com> - 0.1.0-1
- Initial package
