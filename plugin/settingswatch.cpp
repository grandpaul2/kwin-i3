#include "settingswatch.h"

#include <workspace.h>

#include <KConfig>
#include <KConfigGroup>

#include <QDBusConnection>
#include <QDBusMessage>
#include <QFileInfo>
#include <QStandardPaths>

static const QString s_group = QStringLiteral("Script-kwin-i3");

SettingsWatch::SettingsWatch()
    : m_path(QStandardPaths::writableLocation(QStandardPaths::GenericConfigLocation) + QStringLiteral("/kwinrc"))
{
    m_last = entries();
    // One watcher on the one file. KConfig saves by writing a new file and renaming it over the
    // old, which ends the watch on it; the directory is watched only to put the file's watch
    // back the moment the new file is there (a path check, no parse), so a second save soon
    // after the first is not missed, and a kwinrc missing at load is picked up when it appears
    // (review, 2026-10-24). KWin itself writes kwinrc (the tiles, on a timer): the group is
    // unchanged then, and nothing happens.
    m_watcher.addPath(QFileInfo(m_path).absolutePath());
    watchFile();
    m_debounce.setSingleShot(true);
    m_debounce.setInterval(100);      // a save is one rename; a form's several keys, one save
    connect(&m_watcher, &QFileSystemWatcher::fileChanged, &m_debounce, qOverload<>(&QTimer::start));
    connect(&m_watcher, &QFileSystemWatcher::directoryChanged, this, [this] {
        if (!m_watcher.files().contains(m_path) && QFileInfo::exists(m_path)) {
            watchFile();
            m_debounce.start();
        }
    });
    connect(&m_debounce, &QTimer::timeout, this, &SettingsWatch::check);
    // m_last is what KWin last loaded, not what this last saw: another reconfigure (Meta+Shift+C,
    // kwin-i3's own) can load a change that is undone before the next check, and the undo must
    // still reach KWin (tests/live/55-helper.sh, section 5). This reads the file a few ms after
    // KWin's reparse (slotReconfigure emits after options' update), so a save inside those ms is
    // missed until the next reconfigure; reading KWin's own copy instead would close that, but
    // its cascade (/etc/xdg/kwinrc) would never equal the file's group (review, 2026-10-24).
    connect(KWin::workspace(), &KWin::Workspace::configChanged, this, [this] {
        m_last = entries();
    });
}

void SettingsWatch::watchFile()
{
    if (QFileInfo::exists(m_path)) {
        m_watcher.addPath(m_path);
    }
}

// The group as the file has it now: a fresh KConfig, not KWin's shared one (which KWin reparses
// only on its own reconfigure, the very thing this decides on).
QMap<QString, QString> SettingsWatch::entries() const
{
    KConfig config(m_path, KConfig::SimpleConfig);
    return config.group(s_group).entryMap();
}

void SettingsWatch::check()
{
    if (!m_watcher.files().contains(m_path)) {
        watchFile();
    }
    const QMap<QString, QString> now = entries();
    if (now == m_last) {
        return;
    }
    m_last = now;
    // Over D-Bus, as Meta+Shift+C does: KWin's own reconfigure (a 200 ms timer, then a reparse
    // and Workspace::configChanged), never a blocking call into ourselves.
    QDBusConnection::sessionBus().send(QDBusMessage::createMethodCall(QStringLiteral("org.kde.KWin"), QStringLiteral("/KWin"),
                                                                      QStringLiteral("org.kde.KWin"), QStringLiteral("reconfigure")));
}
