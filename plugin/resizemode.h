// i3's resize mode (behaviour.md §8 K4): entered by kwin-i3's Resize
// Mode action (Meta+R) over D-Bus, left by Return, Escape or Meta+R. While it is on, a key filter
// ahead of KWin's global shortcuts takes, by evdev code as i3's bindcode does (so no keyboard
// layout matters): J and Left shrink the width, K and Down grow the height, L and Up shrink the
// height, ; and Right grow the width, on press and on repeat (holding a key keeps resizing), each
// run through kwin-i3's action by invokeShortcut; every other key goes on to the focused window,
// as in i3 (KWin's own shortcuts see it too: kwin-i3 ignores its own while the mode is on). The
// mode's state is the helper's: it tells kwin-i3 through a hidden action (kwin-i3 Mode Changed,
// then Mode()) and kwini3hold directly (the banner on the focused window), as the drag does.
// Also C's terminal: kdeglobals' default terminal launched through kglobalaccel, so it gets its
// own systemd scope, not KWin's (probe 92).
#pragma once

#include <input.h>

#include <QObject>
#include <QString>

class ResizeMode : public QObject, public KWin::InputEventFilter
{
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "net.local.kwini3mode")
public:
    ResizeMode();
    ~ResizeMode() override;

    bool keyboardKey(KWin::KeyboardKeyEvent *event) override;

public Q_SLOTS:
    // D-Bus: org.kde.KWin /kwini3mode net.local.kwini3mode. "resize" enters, "" leaves.
    void SetMode(const QString &mode);
    QString Mode() const { return m_mode; }
    // kdeglobals [General] TerminalService (Konsole when unset), launched as Plasma launches an
    // app's shortcut: its desktop file's kglobalaccel component and its _launch action.
    void LaunchTerminal();
    QString TerminalService() const;

private:
    void enter();
    void leave();
    void tell();
    void invoke(const QString &action);

    QString m_mode;
    bool m_installed = false;
};
