// The Frame tab: how tiling windows look (tiledLook), the frame's width and colours, hiding it at
// the edges (hideEdgeBorders), rounded corners, and the frame on floating windows. All drawn by
// kwini3hold: greyed without it.
import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM
import "settings.js" as Logic

KCM.SimpleKCM {
    id: root
    title: i18nc("@title", "Frame")
    readonly property var settings: kcm.settings
    readonly property real frameColumn: Math.max(tiledLook.implicitWidth, hideEdgesBox.implicitWidth)
    // The frame's width and colours apply wherever a frame is drawn.
    readonly property bool frameDrawn: settings.tiledLook === "frame" || settings.frameOnFloating

    Kirigami.FormLayout {
        // Without the plugins tiled windows keep their title bars, so
        // the choice needs them as the frame does.
        ColumnLayout {
          Kirigami.FormData.label: i18nc("@label:listbox", "Tiling windows show:")
          Kirigami.FormData.buddyFor: tiledLook
          spacing: 0
          RowLayout {
            spacing: Kirigami.Units.smallSpacing
            ChoiceBox {
                id: tiledLook
                columnWidth: root.frameColumn
                settingName: "tiledLook"
                applies: kcm.frameAvailable
                model: [
                    { text: i18nc("@item:inlistbox", "A frame"), value: "frame" },
                    { text: i18nc("@item:inlistbox", "Titlebars"), value: "titlebars" },
                    { text: i18nc("@item:inlistbox", "Neither"), value: "bare" },
                ]
            }
            Help {
                topic: i18nc("@item help topic", "how tiling windows look")
                toolTipText: i18n("A frame: a thin coloured line around each window, in place of its titlebar. Titlebars: Plasma's own. i3: default_border")
            }
        }
        // Nothing marks the focused window then; KWin's own effect can (spec, item 6).
          QQC2.Label {
              visible: root.settings.tiledLook === "bare"
              Layout.maximumWidth: Kirigami.Units.gridUnit * 24
              wrapMode: Text.Wrap
              font: Kirigami.Theme.smallFont
              text: i18nc("@info", "Nothing marks the focused window; the Dim Inactive effect can, with its \"Keep above windows\" ticked, as floating windows are kept above.")
        }
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label:spinbox", "Width:")
            Kirigami.FormData.buddyFor: frameWidthBox
            spacing: Kirigami.Units.smallSpacing
            UnitSpinBox {
                id: frameWidthBox
                unit: "px"
                from: 1; to: 10
                value: root.settings.frameWidth
                onValueModified: root.settings.frameWidth = value
                Accessible.name: i18nc("@label:spinbox", "Frame width")
                KCM.SettingStateBinding { configObject: root.settings; settingName: "frameWidth"; extraEnabledConditions: kcm.frameAvailable && root.frameDrawn }
            }
            Help {
                topic: i18nc("@item help topic", "the frame's width")
                toolTipText: i18n("i3: default_border pixel")
            }
        }
        // i3's colour classes, two (focused_inactive left out; docs/behaviour.md §7 L3), one
        // colour a row. The split indicator shows only until the focus leaves its window (L4), so
        // the unfocused class's indicator is almost never seen: it keeps its default, off the page.
        ColourRow {
            columnWidth: root.frameColumn
            Kirigami.FormData.label: i18nc("@label", "Focused frame:")
            settingName: "frameActive"
            name: i18nc("@action:button", "Frame colour of the focused window")
        }
        ColourRow {
            columnWidth: root.frameColumn
            Kirigami.FormData.label: i18nc("@label", "Unfocused frame:")
            settingName: "frameInactive"
            name: i18nc("@action:button", "Frame colour of unfocused windows")
        }
        ColourRow {
            columnWidth: root.frameColumn
            Kirigami.FormData.label: i18nc("@label", "Split indicator:")
            settingName: "frameIndicatorActive"
            // Empty in kwinrc: the frame's colour, shown as such.
            shown: root.settings.frameIndicatorActive || root.settings.frameActive
            name: i18nc("@action:button", "Split indicator colour")
            Help {
                topic: i18nc("@item help topic", "the split indicator")
                toolTipText: i18n("Marks the side where the next window opens, on a window alone in its split, after Split H, Split V or Toggle Split until the focus leaves it. i3: client.focused indicator")
            }
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label:listbox", "Hide frame:")
            Kirigami.FormData.buddyFor: hideEdgesBox
            spacing: Kirigami.Units.smallSpacing
            ChoiceBox {
                id: hideEdgesBox
                columnWidth: root.frameColumn
                settingName: "hideEdgeBorders"
                applies: kcm.frameAvailable && root.settings.tiledLook === "frame"
                model: [
                    { text: i18nc("@item:inlistbox", "Never"), value: "none" },
                    { text: i18nc("@item:inlistbox", "Left and right edges"), value: "vertical" },
                    { text: i18nc("@item:inlistbox", "Top and bottom edges"), value: "horizontal" },
                    { text: i18nc("@item:inlistbox", "All edges"), value: "both" },
                    { text: i18nc("@item:inlistbox", "On a lone window"), value: "smart" },
                    { text: i18nc("@item:inlistbox", "On a lone window without gaps"), value: "smart_no_gaps" },
                ]
            }
            Help {
                topic: i18nc("@item help topic", "hiding the frame")
                toolTipText: i18n("Hides the frame at the screen's edges, or on a window alone on its workspace. i3: hide_edge_borders")
            }
        }
        // Drawn by kwini3hold, so they need the plugins too; a title bar brings its theme's corners.
        // A floating window's frame uses the same colour classes (§7 L11).
        Tick {
            id: cornersBox
            Kirigami.FormData.label: i18nc("@label", "Rounded corners:")
            name: i18nc("@option:check", "Round the corners of tiling windows")
            checked: root.settings.roundedCorners
            onToggled: root.settings.roundedCorners = checked
            KCM.SettingStateBinding { configObject: root.settings; settingName: "roundedCorners"; extraEnabledConditions: kcm.frameAvailable && root.settings.tiledLook !== "titlebars" }
        }
        RowLayout {
            Kirigami.FormData.label: i18nc("@label", "Frame on floating windows:")
            Kirigami.FormData.buddyFor: floatingFrameBox
            spacing: Kirigami.Units.smallSpacing
            Tick {
                id: floatingFrameBox
                name: i18nc("@option:check", "Draw the frame on floating windows too")
                checked: root.settings.frameOnFloating
                onToggled: root.settings.frameOnFloating = checked
                KCM.SettingStateBinding { configObject: root.settings; settingName: "frameOnFloating"; extraEnabledConditions: kcm.frameAvailable }
            }
            Help {
                topic: i18nc("@item help topic", "the frame on floating windows")
                toolTipText: i18n("Floating windows lose their titlebar too and get the frame. i3: default_floating_border")
            }
        }

    }
}
