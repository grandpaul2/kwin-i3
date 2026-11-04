// The Tiling tab: how far a key moves or resizes (resizeStep, floatingStep), where the focus goes
// from the last window (focusWrapping), and layout changes all at once (holdEnabled).
import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM

KCM.SimpleKCM {
    id: root
    title: i18nc("@title", "Tiling")
    readonly property var settings: kcm.settings

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
            Kirigami.FormData.label: i18nc("@label:listbox", "Focus wrapping:")
            Kirigami.FormData.buddyFor: wrappingBox
            spacing: Kirigami.Units.smallSpacing
            ChoiceBox {
                id: wrappingBox
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
