#pragma once
// The Keys sub-page's model (docs/spec-settings-page.md, "The Keys sub-page"): one row per command,
// each with the one to three kwin-i3 actions that are its keys. Edits are pending until save();
// a key another shortcut holds is named in its row and taken from that holder on save, recorded
// where make take-keys records (so make restore-keys gives it back).

#include <QAbstractListModel>
#include <QJsonObject>
#include <QKeySequence>
#include <QStringList>

class KeysModel : public QAbstractListModel
{
    Q_OBJECT
    Q_PROPERTY(bool available READ available NOTIFY availableChanged)
    // Set by save() when a key couldn't be taken or set; cleared by the next save.
    Q_PROPERTY(QString error MEMBER m_error NOTIFY changed)
    // The current keyboard layout's keys, [unshifted, shifted, typed] each, for naming a shifted
    // symbol by its keys (ui/shifted.js, docs/spec-keys-shifted-labels.md). Read at load.
    Q_PROPERTY(QVariantList layoutTable MEMBER m_layoutTable NOTIFY changed)

public:
    enum Roles { GroupRole = Qt::UserRole + 1, LabelRole, NoteRole, SlotsRole };

    explicit KeysModel(QObject *parent = nullptr);

    int rowCount(const QModelIndex &parent = {}) const override;
    QVariant data(const QModelIndex &index, int role) const override;
    QHash<int, QByteArray> roleNames() const override;

    bool available() const { return m_available; }
    void load();
    void save();
    void defaults();
    bool isSaveNeeded() const;
    bool isDefaults() const;

    Q_INVOKABLE void setKey(int row, int slot, const QKeySequence &key);

Q_SIGNALS:
    void changed();
    void availableChanged();

private:
    struct Holder {
        QString component, action, friendly;
    };
    struct Slot {
        QString action;
        QKeySequence def, current, pending;
        Holder holder; // a foreign holder of pending, taken from on save; empty if none
    };
    struct Row {
        QString group, label, note;      // note: muted text beside the keys ("in resize mode: J, Left")
        QList<Slot> entries;
    };
    void findHolders();
    QVariant shown(int row) const;
    bool take(const Slot &s, QJsonObject &taken);
    QList<Row> m_rows;
    bool m_available = false;
    QString m_error;
    QVariantList m_layoutTable;
};

// Whether KWin runs the kwin-i3 script now (the page and this model both ask).
bool kwinI3Loaded();
