#pragma once
// The Plasma Settings sub-page's model (docs/plan.md, "Install and first run"): the Plasma
// settings kwin-i3 is designed around, each with Plasma's value now and the one kwin-i3 would
// set. Nothing changes but on apply(); each change is saved first (its old value and the value
// written, plasma-settings.json beside make take-keys' save) and given back where Plasma still
// has what kwin-i3 wrote. Keys go through make take-keys' save (keys.h).

#include "keys.h"

#include <QObject>
#include <QStringList>
#include <QVariantList>

#include <functional>

class SetupModel : public QObject
{
    Q_OBJECT
    // One map per row shown: id, title, plasma (what Plasma does, in a sentence), plasmaDefault
    // (that is Plasma's default), kwini3 (what kwin-i3 needs instead), why, note (a caution the
    // give-back carries), optional, differs, changed (by kwin-i3, can be given back), before (what
    // Plasma did before kwin-i3 changed it).
    Q_PROPERTY(QVariantList rows MEMBER m_rows NOTIFY changed)
    // A row kwin-i3 needs differs from Plasma now: the page's banner.
    Q_PROPERTY(bool needed MEMBER m_needed NOTIFY changed)
    Q_PROPERTY(bool anyChanged MEMBER m_anyChanged NOTIFY changed)
    Q_PROPERTY(QString error MEMBER m_error NOTIFY changed)

public:
    explicit SetupModel(KeysModel *keys, QObject *parent = nullptr);

    Q_INVOKABLE void load();
    Q_INVOKABLE void apply(const QStringList &ids);
    Q_INVOKABLE void giveBack(const QString &id);
    Q_INVOKABLE void giveBackAll();

    struct Change {
        QString file, group, key, value;
    };
    // A value as Plasma holds it, from wherever it is read (Plasma's settings, or the save).
    using Getter = std::function<QString(const Change &)>;
    struct Row {
        QString id, title, kwini3, why, note;
        bool optional = false;
        QList<Change> changes;                       // config rows
        std::function<bool()> shown;                 // null: always
        std::function<QString(const Getter &)> plasma; // what Plasma does with these values
    };

Q_SIGNALS:
    void changed();

private:
    QString effective(const Change &c) const;
    QString before(const Change &c) const;
    bool differs(const Row &r) const;
    bool changedByUs(const Row &r) const;
    void reconfigure() const;
    QList<std::pair<int, KeyHolder>> clashes() const;

    KeysModel *m_keys;
    QList<Row> m_defs;
    QVariantList m_rows;
    bool m_needed = false;
    bool m_anyChanged = false;
    QString m_error;
};
