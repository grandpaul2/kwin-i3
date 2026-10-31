// Settings that apply on Apply. KWin's generic script
// config form saves kwinrc [Script-kwin-i3] and tells KWin nothing (genericscriptedconfig.cpp
// ScriptingConfig::reload is a TODO in 6.7.5), and a running script sees new values only after
// a KWin reconfigure. This watches kwinrc and, when that group's entries change, asks KWin to
// reconfigure, as Meta+Shift+C does. Without the plugins, Meta+Shift+C stays the way.
#pragma once

#include <QFileSystemWatcher>
#include <QMap>
#include <QObject>
#include <QString>
#include <QTimer>

class SettingsWatch : public QObject
{
    Q_OBJECT
public:
    SettingsWatch();

private:
    QMap<QString, QString> entries() const;
    void watchFile();
    void check();

    QString m_path;
    QFileSystemWatcher m_watcher;
    QTimer m_debounce;
    QMap<QString, QString> m_last;
};
