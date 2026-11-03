// kwin-i3's keys over Plasma's, without changing Plasma's (behaviour.md §8, "Shared keys"). i3
// grabs its bound keys itself (bindings.c:155 grab_all_keys), so a binding runs i3's command
// whatever else wants the key. Here kglobalaccel gives a key two actions hold to the older one,
// Plasma's (kwin-notes, "Keys"); while keysOverride is on, this runs kwin-i3's instead:
//
// - Ahead of KWin's global shortcut filter (a plugin's filter runs before KWin's own of the same
//   weight, kwin-notes), a press of one of kwin-i3's keys triggers kwin-i3's action and goes on
//   with its key set to Qt::Key_unknown: kglobalacceld sees a key no shortcut has, so no Plasma
//   shortcut runs, and its modifier-only state resets (a press kept from it entirely left Meta's
//   release opening the launcher, probe 92).
// - Right after that filter, the marked press, its repeats and its release are taken (and the key
//   filtered), so no window sees them.
//
// kwin-i3's keys: its script's actions (each a QAction named "kwin-i3 …", a child of the script,
// KWin's Script::registerShortcut) with their keys from kglobalaccel, read asynchronously (a
// blocking call from inside KWin waits on itself) when a layout fit ends (the script asks for one
// as it loads), on KWin's reconfigure, and when the settings page applies keys (RefreshKeys).
// An action gone (the script unloaded) is skipped: no key is taken for it. Not while a window
// inhibits shortcuts, as KWin's own filter; Alt+Tab's filter and the lock screen's come first.
#pragma once

#include <input.h>

#include <KConfigWatcher>

#include <QHash>
#include <QObject>
#include <QPointer>
#include <QSet>

class QAction;

class KeyOverride : public QObject, public KWin::InputEventFilter
{
    Q_OBJECT
public:
    KeyOverride();
    ~KeyOverride() override;

    bool keyboardKey(KWin::KeyboardKeyEvent *event) override;

    // kwin-i3's actions and their keys, read again.
    void refresh();
    // For the live tests and bug reports: on or off, and each key with its action.
    QString plan() const;

private:
    class After : public KWin::InputEventFilter
    {
    public:
        explicit After(KeyOverride *override);
        bool keyboardKey(KWin::KeyboardKeyEvent *event) override;

    private:
        KeyOverride *m_override;
    };

    void load();

    bool m_on = false;
    QHash<int, QPointer<QAction>> m_keys;       // a Qt key combination -> kwin-i3's action
    QSet<quint32> m_marked;                     // scan codes on their way to After
    int m_generation = 0;                       // a refresh's answers, stale once another starts
    KConfigWatcher::Ptr m_watcher;
    After m_after;
};
