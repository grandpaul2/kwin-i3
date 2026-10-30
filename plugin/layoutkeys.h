// kwin-i3's keys that mean a key position, fitted to the keyboard layout (docs/records/spec-keyboard-layouts.md).
// KWin matches a shortcut by the symbol the key types in the current layout, never by position
// (xkb.cpp modifiersRelevantForGlobalShortcuts; kglobalacceld activeShortcutByKey), and kwin-i3
// registers US symbols: Meta+Shift+2 is Meta+@. A script can't read the keymap, nor send
// kglobalaccel the typed key lists it takes, so this does both: for the digit row and the ;
// key, the current layout's symbols as KWin will see them, given to kwin-i3's actions and
// refitted when the layout changes. An action the user has bound to something else is left alone.
#pragma once

#include <QDBusPendingCall>
#include <QList>
#include <QObject>
#include <QString>
#include <QStringList>

class LayoutKeys : public QObject
{
    Q_OBJECT
public:
    LayoutKeys();
    ~LayoutKeys() override;

public Q_SLOTS:
    // The script, once its keys are registered at load.
    void FitKeys();
    // For the live tests and bug reports: the layouts and each action's keys, as last fitted.
    QString Plan() const;

private:
    struct Want {
        QString action;
        QList<int> keys;     // Qt key combinations (one, or none if the layout has no symbol there)
    };
    QList<Want> plan() const;
    void apply(const QList<Want> &wants, const QString &plan);
    void set(const QList<Want> &change, const QString &plan);
    void done(const QString &plan);
    QDBusPendingCall setKeys(const QString &action, const QList<int> &keys);

    QString m_plan;
    bool m_busy = false;
    bool m_again = false;
};
