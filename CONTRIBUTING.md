## Building from Source

### 1. Clone the repository

```bash
git clone https://github.com/r6mez/Terminator.git
cd Terminator
```

### 2. Install dependencies

You'll need `meson`, `gjs`, and a few GNOME libraries installed before building.

#### Arch Linux

```bash
sudo pacman -S meson gjs gtk4 libadwaita packagekit
```

#### Fedora

```bash
sudo dnf install meson gjs gtk4-devel libadwaita-devel PackageKit gettext pkg-config cmake glib2-devel
```

#### Ubuntu / Debian

```bash
sudo apt install meson gjs libgtk-4-1 libadwaita-1-0 packagekit \
  gettext pkg-config cmake libglib2.0-dev-bin libglib2.0-dev \
  gir1.2-gtk-4.0 gir1.2-adw-1
```

### 3. Build and run

```bash
meson setup build
meson compile -C build

# either install the application on your system
sudo meson install -C build

# or run directly from the build directory without installing
./build/data/org.ramez.terminator
```

### Dependencies reference

**Build:**
- meson (>= 1.0.0)
- gjs
- gettext
- pkg-config
- cmake
- glib2 development files

**Runtime:**
- gjs
- gtk4
- libadwaita
- packagekit (for uninstalling system packages)
- GTK4 and Adwaita GObject Introspection data