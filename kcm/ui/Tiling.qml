// The Tiling tab: how far a key moves or resizes (resizeStep, floatingStep), focus following the
// mouse (focusFollowsMouse), the pointer following
// the focus (mouseWarping), where the focus goes from the last window (focusWrapping), the tiling
// drag (tilingDrag), and layout changes all at once (holdEnabled).
import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM

KCM.SimpleKCM {
    id: root
    title: i18nc("@title", "Tiling")
    readonly property var settings: kcm.settings
    // The dropdowns share one width, the widest one's own (docs/style-settings-page.md, "Layout").
    readonly property real listColumn: Math.max(wrappingBox.implicitWidth, dragBox.implicitWidth)

    Kirigami.FormLayout {
        // How far one key press goes: a share of the split for tiling windows, pixels for floating
        // ones, as in i3. A row each.
        RowLayout {
            Kirigami.FormData.label: i18nc("@label:spinbox", "Tiling key step:")
            Kirigami.FormData.buddyFor: resizeStepBox
            spacing: Kirigami.Units.smallSpacing
            UnitSpinBox {
                id: resizeStepBox
                unit: "%"
                from: 1; to: 50
                value: root.settings.resizeStep
                onValueModified: root.settings.resizeStep = value
                Accessible.name: i18nc("@label:spinbox", "Resize step")
                KCM.SettingStateBinding { configObject: root.settings; settingName: "resizeStep" }
            }
            Help {
                topic: i18nc("@item help topic", "the key step")
                toolTipText: i18n("How far one press of a resize key goes for a tiling window, as a share of its split, and of a move or resize key for a floating window. i3: resize grow width 10 px or 10 ppt, move left 10 px")
            }
        }
        UnitSpinBox {
            id: floatingStepBox
            Kirigami.FormData.label: i18nc("@label:spinbox", "Floating key step:")
            unit: "px"
            from: 1; to: 200
            value: root.settings.floatingStep
            onValueModified: root.settings.floatingStep = value
            Accessible.name: i18nc("@label:spinbox", "How far a key moves or resizes a floating window")
            KCM.SettingStateBinding { configObject: root.settings; settingName: "floatingStep" }
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label", "Focus follows the mouse:")
            Kirigami.FormData.buddyFor: ffmBox
            spacing: Kirigami.Units.smallSpacing
            Tick {
                id: ffmBox
                name: i18nc("@option:check", "Focus follows the mouse")
                recommended: true
                checked: root.settings.focusFollowsMouse
                onToggled: root.settings.focusFollowsMouse = checked
                KCM.SettingStateBinding { configObject: root.settings; settingName: "focusFollowsMouse" }
            }
            Help {
                topic: i18nc("@item help topic", "focus follows the mouse")
                toolTipText: i18n("The window under the pointer takes the focus at once; turned off, a click focuses. While kwin-i3 runs this replaces Plasma's focus setting, which is left as it is. i3: focus_follows_mouse")
            }
        }
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
            Kirigami.FormData.label: i18nc("@label:listbox", "Focus wrapping:")
            Kirigami.FormData.buddyFor: wrappingBox
            spacing: Kirigami.Units.smallSpacing
            ChoiceBox {
                id: wrappingBox
                columnWidth: root.listColumn
                settingName: "focusWrapping"
                model: [
                    { text: i18nc("@item:inlistbox", "Next screen, then wrap"), value: "yes" },
                    { text: i18nc("@item:inlistbox", "Next screen only"), value: "no" },
                    { text: i18nc("@item:inlistbox", "Always wrap"), value: "force" },
                    { text: i18nc("@item:inlistbox", "Stay on the workspace"), value: "workspace" },
                ]
            }
            Help {
                topic: i18nc("@item help topic", "focus wrapping")
                toolTipText: i18n("Where focus goes from the last window in a direction. Always wrap stays inside the split. i3: focus_wrapping")
            }
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label:listbox", "Drag tiling windows by:")
            Kirigami.FormData.buddyFor: dragBox
            spacing: Kirigami.Units.smallSpacing
            ChoiceBox {
                id: dragBox
                columnWidth: root.listColumn
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
        // holdEnabled; holdTimeoutMs is an internal value, kwinrc only (plan.md, "Settings").
        RowLayout {
            Kirigami.FormData.label: i18nc("@label", "Layout changes all at once:")
            Kirigami.FormData.buddyFor: holdBox
            spacing: Kirigami.Units.smallSpacing
            Tick {
                id: holdBox
                name: i18nc("@option:check", "Show layout changes all at once")
                recommended: true
                checked: root.settings.holdEnabled
                onToggled: root.settings.holdEnabled = checked
                KCM.SettingStateBinding { configObject: root.settings; settingName: "holdEnabled"; extraEnabledConditions: kcm.holdLoaded }
            }
            Help {
                topic: i18nc("@item help topic", "layout changes")
                toolTipText: i18n("A new layout appears in one go, instead of window by window as each app redraws. Needs kwin-i3's plugins.")
            }
        }

    }
}
