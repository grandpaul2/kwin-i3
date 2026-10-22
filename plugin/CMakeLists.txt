# kwini3mouse: modifier + mouse button chords for KWin (docs/mouse-plugin-design.md).
# Built against the installed kwin-devel; KWin refuses a build from another KWin version.
cmake_minimum_required(VERSION 3.22)
project(kwini3mouse LANGUAGES CXX)

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

kcoreaddons_add_plugin(kwini3mouse INSTALL_NAMESPACE "kwin/plugins")
target_sources(kwini3mouse PRIVATE main.cpp mousechords.cpp)
target_link_libraries(kwini3mouse PRIVATE KWin::kwin Qt6::DBus KF6::ConfigCore)
