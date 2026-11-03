// The Mouse & Focus tab: the pointer following the focus (mouseWarping), the tiling drag
// (tilingDrag) and new windows over a fullscreen one (popupDuringFullscreen).
import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM
import "settings.js" as Logic

KCM.SimpleKCM {
    id: root
    title: i18nc("@title", "Mouse & Focus")
    readonly property var settings: kcm.settings
    // The dropdowns share one width, the widest one's own (docs/style-settings-page.md, "Layout").
    readonly property real mouseColumn: Math.max(dragBox.implicitWidth, popupBox.implicitWidth)

    Kirigami.FormLayout {
        RowLayout {
            Kirigami.FormData.label: i18nc("@label", "Pointer follows the focus:")
            Kirigami.FormData.buddyFor: warpBox
            spacing: Kirigami.Units.smallSpacing
            Tick {
                id: warpBox
                name: i18nc("@option:check", "Move the pointer with focus to another screen")
                recommended: true
                checked: root.settings.mouseWarping === "output"
                onToggled: root.settings.mouseWarping = checked ? "output" : "none"
                KCM.SettingStateBinding { configObject: root.settings; settingName: "mouseWarping" }
            }
            Help {
                topic: i18nc("@item help topic", "the pointer")
                toolTipText: i18n("When a key moves the focus to another screen, the pointer goes to the middle of the focused window. i3: mouse_warping")
            }
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label:listbox", "Drag tiling windows by:")
            Kirigami.FormData.buddyFor: dragBox
            spacing: Kirigami.Units.smallSpacing
            ChoiceBox {
                id: dragBox
                columnWidth: root.mouseColumn
                settingName: "tilingDrag"
                applies: kcm.helperLoaded       // plugin/tilingdrag.cpp
                model: [
                    { text: i18nc("@item:inlistbox", "Titlebar, or Meta anywhere"), value: "modifier titlebar" },
                    { text: i18nc("@item:inlistbox", "Meta anywhere"), value: "modifier" },
                    { text: i18nc("@item:inlistbox", "Titlebar"), value: "titlebar" },
                    { text: i18nc("@item:inlistbox", "Neither: no dragging"), value: "off" },
                ]
            }
            Help {
                topic: i18nc("@item help topic", "dragging tiling windows")
                toolTipText: i18n("Dropped beside another window, a tiling window moves there; dropped on its middle, the two are grouped or swapped. Meta+Shift+drag floats a tiling window, or tiles a floating one. i3: tiling_drag")
            }
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label:listbox", "New windows over fullscreen:")
            Kirigami.FormData.buddyFor: popupBox
            spacing: Kirigami.Units.smallSpacing
            ChoiceBox {
                id: popupBox
                columnWidth: root.mouseColumn
                settingName: "popupDuringFullscreen"
                model: [
                    { text: i18nc("@item:inlistbox", "Behind; the fullscreen app's dialogs in front"), value: "smart" },
                    { text: i18nc("@item:inlistbox", "Always behind"), value: "ignore" },
                    { text: i18nc("@item:inlistbox", "The fullscreen app's dialogs end fullscreen"), value: "leave_fullscreen" },
                    { text: i18nc("@item:inlistbox", "Floating ones in front"), value: "all" },
                ]
            }
            Help {
                topic: i18nc("@item help topic", "new windows in fullscreen")
                toolTipText: i18n("Where a window goes when it opens on a workspace that has a fullscreen window. i3: popup_during_fullscreen")
            }
        }

    }
}
