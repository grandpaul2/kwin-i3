#pragma once
// The Keys sub-page's model: one row per command,
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
    // Set by save() when a key couldn't be taken or set; cleared by the next save.
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
    // Every key kwin-i3's actions hold (read at load), with the action holding it.
    QList<std::pair<int, QString>> currentKeys() const;

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

// Another action's hold on a key (not kwin-i3's own); empty if none.
struct KeyHolder {
    QString component, action, friendly;
};
KeyHolder keyHolder(int code);
bool componentActive(const QString &component);
// Takes the key from its holder, recorded in taken-keys.json first (only the Plasma Settings
// page's "Free Meta+T" row takes a key now).
bool takeKey(const KeyHolder &holder, int code);
// Gives an action the key back where no shortcut holds it (a row moved to Plasma's side).
void restoreKeyDefault(const QString &component, const QString &action, int code);
// The save's records, "component|action".
QStringList takenIds();
// Gives back the records `which` accepts, as tools/take-keys.py restore: where the holder still has what
// kwin-i3 left it. Returns how many couldn't be reached (they stay in the save).
int giveBackKeys(const std::function<bool(const QString &id)> &which);
