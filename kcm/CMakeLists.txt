# kcm_kwin_i3: kwin-i3's own page in System Settings > Window Management (docs/spec-settings-page.md).
# Apart from plugin/: it links no KWin library, so a KWin update doesn't refuse it. It needs
# kf6-kcmutils-devel and kf6-ki18n-devel.
cmake_minimum_required(VERSION 3.22)
project(kcm_kwin_i3 LANGUAGES CXX)

find_package(ECM REQUIRED NO_MODULE)
set(CMAKE_MODULE_PATH ${ECM_MODULE_PATH})
include(KDEInstallDirs)
include(KDECMakeSettings)
include(KDECompilerSettings NO_POLICY_SCOPE)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Qt6 REQUIRED COMPONENTS Core Gui Qml DBus)
find_package(KF6 REQUIRED COMPONENTS CoreAddons Config KCMUtils I18n Service)
find_package(PkgConfig REQUIRED)
pkg_check_modules(XKBCOMMON REQUIRED IMPORTED_TARGET xkbcommon)    # the layout's keys, keys.cpp

# The settings class comes from the script's own main.xml, so the two can't drift apart. KWin
# wants its file and group names empty (it fills them in); kconfig_compiler refuses empty ones,
# so this copy names them.
set(main_xml ${CMAKE_CURRENT_SOURCE_DIR}/../package/contents/config/main.xml)
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS ${main_xml})
file(READ ${main_xml} kcfg)
string(REPLACE "<kcfgfile name=\"\"/>" "<kcfgfile name=\"kwinrc\"/>" kcfg "${kcfg}")
string(REPLACE "<group name=\"\">" "<group name=\"Script-kwin-i3\">" kcfg "${kcfg}")
string(FIND "${kcfg}" "<kcfgfile name=\"kwinrc\"/>" file_at)
string(FIND "${kcfg}" "<group name=\"Script-kwin-i3\">" group_at)
if(file_at EQUAL -1 OR group_at EQUAL -1)
    message(FATAL_ERROR "main.xml: no empty kcfgfile/group name to fill in")
endif()
# file(CONFIGURE) writes only a changed file, so a configure alone doesn't force a rebuild.
file(CONFIGURE OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/kwini3settings.kcfg CONTENT "${kcfg}" @ONLY)
file(CONFIGURE OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/kwini3settings.kcfgc @ONLY CONTENT
     "File=kwini3settings.kcfg\nClassName=KWinI3Settings\nMutators=true\nDefaultValueGetters=true\nGenerateProperties=true\nParentInConstructor=true\nNotifiers=true\n")

kcmutils_add_qml_kcm(kcm_kwin_i3 SOURCES kcm.cpp keys.cpp)
kconfig_add_kcfg_files(kcm_kwin_i3 ${CMAKE_CURRENT_BINARY_DIR}/kwini3settings.kcfgc GENERATE_MOC)
target_link_libraries(kcm_kwin_i3 PRIVATE Qt6::DBus Qt6::Gui Qt6::Qml KF6::KCMUtilsQuick KF6::ConfigCore KF6::ConfigGui KF6::I18n KF6::CoreAddons KF6::Service PkgConfig::XKBCOMMON)
