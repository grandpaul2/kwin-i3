# kwini3helper: kwin-i3's KWin plugin: focus on the frame (docs/spec-decoration.md), settings
# that apply on Apply (docs/spec-settings.md), i3's tiling drag (docs/spec-tiled-look.md), keys
# fitted to the keyboard layout (docs/spec-keyboard-layouts.md), panel popups' grace
# (docs/spec-popup-grace.md), i3's resize mode (docs/spec-redo-5-keys.md). kwini3mouse until 2026-10-24.
# kwini3hold: atomic layout changes and i3's frame around tiled windows, a KWin effect
# (docs/spec-atomic-layout.md, docs/spec-window-modes.md).
# Built against the installed kwin-devel; KWin refuses a build from another KWin version.
# (kwini3frame, a decoration drawing the frame, was retired 2026-10-24: docs/spec-window-modes.md.)
cmake_minimum_required(VERSION 3.22)
project(kwini3 LANGUAGES CXX)

find_package(ECM REQUIRED NO_MODULE)
set(CMAKE_MODULE_PATH ${ECM_MODULE_PATH})
include(KDEInstallDirs)
include(KDECMakeSettings)
include(KDECompilerSettings NO_POLICY_SCOPE)
# Emptied at every configure (make plugin configures each time), so bin holds only what is built
# now: the test KWins and the fuzzer load from it, and a renamed or retired plugin left there was
# loaded by every test (kwini3mouse.so until 2026-10-24; docs/spec-plugin-stale-outputs.md).
file(REMOVE_RECURSE ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Qt6 REQUIRED COMPONENTS Core Gui Widgets DBus)
find_package(KF6 REQUIRED COMPONENTS CoreAddons Config)
find_package(KWin REQUIRED COMPONENTS kwin)
find_package(KDecoration3 REQUIRED)                                # the title bar (tilingdrag.cpp)
find_package(PkgConfig REQUIRED)
pkg_check_modules(XKBCOMMON REQUIRED IMPORTED_TARGET xkbcommon)    # the keymap, for layoutkeys.cpp

kcoreaddons_add_plugin(kwini3helper INSTALL_NAMESPACE "kwin/plugins")
target_sources(kwini3helper PRIVATE main.cpp helper.cpp framefocus.cpp settingswatch.cpp layoutkeys.cpp popupgrace.cpp tilingdrag.cpp resizemode.cpp)
target_link_libraries(kwini3helper PRIVATE KWin::kwin KDecoration3::KDecoration Qt6::DBus KF6::ConfigCore PkgConfig::XKBCOMMON)

# automoc scans for macro names, and KWin's factory macro hides the Q_OBJECT inside it.
list(APPEND CMAKE_AUTOMOC_MACRO_NAMES "KWIN_EFFECT_FACTORY_SUPPORTED")
kcoreaddons_add_plugin(kwini3hold INSTALL_NAMESPACE "kwin/effects/plugins")
target_sources(kwini3hold PRIVATE holdmain.cpp hold.cpp)
target_link_libraries(kwini3hold PRIVATE KWin::kwin Qt6::DBus KF6::ConfigCore)

