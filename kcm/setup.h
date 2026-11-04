#pragma once
// The Plasma tab's model (docs/plan.md, "Install and first run"): the Plasma
// settings kwin-i3 is designed around, each with Plasma's value now and the one kwin-i3 would
// set. A row's tick is a pending edit like any setting on the page: the page's Apply makes it
// (ticked: kwin-i3's value; unticked where kwin-i3 changed it: Plasma's given back), Reset drops
// it, Defaults puts Plasma's back (givePlasmaBack). Each change is saved first (its old value and the value
// written, plasma-settings.json beside taken-keys.json) and given back where Plasma still
// has what kwin-i3 wrote. Meta+T's take goes through taken-keys.json (keys.h); the key override
// row writes no Plasma setting at all.

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
    // Plasma did before kwin-i3 changed it), settled (Plasma already has it and kwin-i3 didn't
    // change it: shown ticked and disabled).
    Q_PROPERTY(QVariantList rows MEMBER m_rows NOTIFY changed)
    // A Plasma setting kwin-i3 needs differs (the keys aside, on the main page): the banner.
    Q_PROPERTY(bool needed MEMBER m_needed NOTIFY changed)
    // Each row's tick, by id: true for kwin-i3's value. Edited with setWanted().
    Q_PROPERTY(QVariantMap wanted MEMBER m_wanted NOTIFY changed)
    Q_PROPERTY(QString error MEMBER m_error NOTIFY changed)

public:
    explicit SetupModel(KeysModel *keys, QObject *parent = nullptr);

    Q_INVOKABLE void load();
    Q_INVOKABLE void setWanted(const QString &id, bool on);
    // The page's Apply, Defaults; whether the ticks differ from Plasma, or from kwin-i3's.
    void save();
    // Defaults on the Plasma tab: every row kwin-i3 changed to the Plasma column (Apply gives back
    // what Plasma had before), the rest as they are.
    void givePlasmaBack();
    bool isPlasmaBack() const;
    bool isSaveNeeded() const { return m_wanted != m_initial; }

    struct Change {
        QString file, group, key, value;
        QString stock = {};             // its stock value where kwin.kcfg has none (an effect's EnabledByDefault)
        QString other = {};             // Plasma's side where the stock value is kwin-i3's own (empty: left as it is)
    };
    // A value as Plasma holds it, from wherever it is read (Plasma's settings, or the save).
    using Getter = std::function<QString(const Change &)>;
    struct Row {
        QString id, title, kwini3, why, note;
        bool optional = false;
        QList<Change> changes;                       // config rows
        std::function<QString(const Getter &)> plasma; // what Plasma does with these values
    };

Q_SIGNALS:
    void changed();
    void edited();      // a tick changed: the page's Apply and Reset follow

private:
    QString effective(const Change &c) const;
    QString before(const Change &c) const;
    QString plasmaSide(const Change &c) const;
    void setPlasmaSide(const Row &r);
    bool keysOverride() const;
    bool differs(const Row &r) const;
    bool changedByUs(const Row &r) const;
    QStringList applyRow(const Row &r);
    int giveBackRow(const Row &r);
    void reconfigure() const;
    QList<std::pair<int, KeyHolder>> clashes() const;

    KeysModel *m_keys;
    QList<Row> m_defs;
    QVariantList m_rows;
    bool m_needed = false;
    QVariantMap m_wanted, m_initial;
    QString m_error;
};
