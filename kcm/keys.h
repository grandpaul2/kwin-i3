#pragma once
// The Keys tab's model: one row per command,
// each with the one to three kwin-i3 actions that are its keys. Edits are pending until save().
// A key another shortcut also holds is set all the same: which of the two runs is the key
// override's (keysOverride, plugin/keyoverride.h), never a key taken from its holder.

#include <QAbstractListModel>
#include <QJsonObject>
#include <QKeySequence>
#include <QStringList>

#include <functional>

class KeysModel : public QAbstractListModel
{
    Q_OBJECT
    Q_PROPERTY(bool available READ available NOTIFY availableChanged)
    // Set by save() when a key couldn't be set; cleared by the next save.
    Q_PROPERTY(QString error MEMBER m_error NOTIFY changed)
    // The current keyboard layout's keys, [unshifted, shifted, typed] each, for naming a shifted
    // symbol by its keys (ui/shifted.js). Read at load.
    Q_PROPERTY(QVariantList layoutTable MEMBER m_layoutTable NOTIFY changed)

public:
    enum Roles { GroupRole = Qt::UserRole + 1, LabelRole, NoteRole, SlotsRole, SettingRole };

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
    struct Slot {
        QString action;
        QKeySequence def, current, pending;
    };
    struct Row {
        QString group, label, note;      // note: muted text beside the keys ("in resize mode: J, Left")
        QString setting;                 // a setting that shapes the command (endSession), shown after its keys
        QList<Slot> entries;
    };
    QVariant shown(int row) const;
    QList<Row> m_rows;
    bool m_available = false;
    QString m_error;
    QVariantList m_layoutTable;
};

// Whether KWin runs the kwin-i3 script now (the page and this model both ask).
bool kwinI3Loaded();
