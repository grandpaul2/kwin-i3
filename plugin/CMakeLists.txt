# kwini3helper: kwin-i3's KWin plugin: focus on the frame, settings
# that apply on Apply, i3's tiling drag, keys
# fitted to the keyboard layout, panel popups' grace
#, i3's resize mode. kwini3mouse until 2026-10-24.
# kwini3hold: atomic layout changes and i3's frame around tiled windows, a KWin effect
#.
# Built against the installed kwin-devel; KWin refuses a build from another KWin version.
# (kwini3frame, a decoration drawing the frame, was retired 2026-10-24.)
cmake_minimum_required(VERSION 3.22)
project(kwini3 LANGUAGES CXX)

# The version makes ECM pick Qt 6: without one it guesses Qt 5 wherever Qt 5's cmake files are
# installed (Arch with qt5-base, 2026-10-29), and Qt 6's QML macros then refuse to load.
find_package(ECM 6.0.0 REQUIRED NO_MODULE)
set(CMAKE_MODULE_PATH ${ECM_MODULE_PATH})
include(KDEInstallDirs)
include(KDECMakeSettings)
include(KDECompilerSettings NO_POLICY_SCOPE)
# Emptied at every configure (make plugin configures each time), so bin holds only what is built
# now: the test KWins and the fuzzer load from it, and a renamed or retired plugin left there was
# loaded by every test (kwini3mouse.so until 2026-10-24).
file(REMOVE_RECURSE ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Widgets: no source here uses it, but KWin's exported targets name Qt6::Widgets (KWinTargets.cmake),
# so the configure fails without it (code review, 2026-10-30).
find_package(Qt6 REQUIRED COMPONENTS Core Gui Widgets DBus)
find_package(KF6 REQUIRED COMPONENTS CoreAddons Config)
find_package(KWin REQUIRED COMPONENTS kwin)
find_package(KDecoration3 REQUIRED)                                # the title bar (tilingdrag.cpp)
find_package(PkgConfig REQUIRED)
pkg_check_modules(XKBCOMMON REQUIRED IMPORTED_TARGET xkbcommon)    # the keymap, for layoutkeys.cpp

kcoreaddons_add_plugin(kwini3helper INSTALL_NAMESPACE "kwin/plugins")
target_sources(kwini3helper PRIVATE main.cpp helper.cpp framefocus.cpp settingswatch.cpp layoutkeys.cpp popupgrace.cpp tilingdrag.cpp resizemode.cpp pointerprobe.cpp gapstrips.cpp)
target_link_libraries(kwini3helper PRIVATE KWin::kwin KDecoration3::KDecoration Qt6::DBus KF6::ConfigCore PkgConfig::XKBCOMMON)

# automoc scans for macro names, and KWin's factory macro hides the Q_OBJECT inside it.
list(APPEND CMAKE_AUTOMOC_MACRO_NAMES "KWIN_EFFECT_FACTORY_SUPPORTED")
kcoreaddons_add_plugin(kwini3hold INSTALL_NAMESPACE "kwin/effects/plugins")
target_sources(kwini3hold PRIVATE holdmain.cpp hold.cpp)
target_link_libraries(kwini3hold PRIVATE KWin::kwin Qt6::DBus KF6::ConfigCore)
# KWin 6.8 (6.7.80 on) made the paint hooks return whether painting succeeded (a GPU reset),
# and premultiplies a colour uniform by its alpha (GLShader::setUniform): hold.h picks the
# signatures and the blend, so one source builds against 6.7 and 6.8.
if(KWin_VERSION VERSION_GREATER_EQUAL 6.7.80)
    target_compile_definitions(kwini3hold PRIVATE KI3_PAINT_RESULT KI3_PREMULTIPLIED_COLOUR)
endif()

