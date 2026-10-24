# kwini3helper: kwin-i3's KWin plugin: focus on the frame (docs/spec-decoration.md) and settings
# that apply on Apply (docs/spec-settings.md). kwini3mouse until 2026-10-24.
# kwini3hold: atomic layout changes, a KWin effect (docs/spec-atomic-layout.md).
# kwini3frame: i3's 1 px frame, a KDecoration3 plugin (docs/spec-decoration.md).
# Built against the installed kwin-devel; KWin refuses a build from another KWin version. The
# decoration is built against kdecoration-devel and is NOT refused by version (no IID check), so
# its build records the kdecoration version for tools/plugin-install.sh and tools/frame-guard.sh.
cmake_minimum_required(VERSION 3.22)
project(kwini3 LANGUAGES CXX)

find_package(ECM REQUIRED NO_MODULE)
set(CMAKE_MODULE_PATH ${ECM_MODULE_PATH})
include(KDEInstallDirs)
include(KDECMakeSettings)
include(KDECompilerSettings NO_POLICY_SCOPE)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Qt6 REQUIRED COMPONENTS Core Gui Widgets DBus)
find_package(KF6 REQUIRED COMPONENTS CoreAddons Config)
find_package(KWin REQUIRED COMPONENTS kwin)
find_package(KDecoration3 REQUIRED)

kcoreaddons_add_plugin(kwini3helper INSTALL_NAMESPACE "kwin/plugins")
target_sources(kwini3helper PRIVATE main.cpp helper.cpp framefocus.cpp settingswatch.cpp)
target_link_libraries(kwini3helper PRIVATE KWin::kwin Qt6::DBus KF6::ConfigCore)

# automoc scans for macro names, and KWin's factory macro hides the Q_OBJECT inside it.
list(APPEND CMAKE_AUTOMOC_MACRO_NAMES "KWIN_EFFECT_FACTORY_SUPPORTED")
kcoreaddons_add_plugin(kwini3hold INSTALL_NAMESPACE "kwin/effects/plugins")
target_sources(kwini3hold PRIVATE holdmain.cpp hold.cpp)
target_link_libraries(kwini3hold PRIVATE KWin::kwin Qt6::DBus KF6::ConfigCore)

# The decoration lands in bin/org.kde.kdecoration3/kwini3frame.so (KDECORATION_PLUGIN_DIR is that
# directory name, from KDecoration3Config). Its id is the file name; KWin loads it by
# kwinrc [org.kde.kdecoration2] library=<id>.
kcoreaddons_add_plugin(kwini3frame INSTALL_NAMESPACE "${KDECORATION_PLUGIN_DIR}")
target_sources(kwini3frame PRIVATE frame.cpp)
target_link_libraries(kwini3frame PRIVATE KDecoration3::KDecoration KF6::CoreAddons KF6::ConfigCore Qt6::Gui)
file(WRITE ${CMAKE_BINARY_DIR}/kdecoration.version "${KDecoration3_VERSION}\n")
