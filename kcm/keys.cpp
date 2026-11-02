#include "keys.h"

#include <KLocalizedString>

#include <QDBusArgument>
#include <QDBusConnection>
#include <QDBusMessage>
#include <QDBusMetaType>
#include <QDBusObjectPath>
#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSaveFile>

#include <algorithm>
#include <optional>

#include <KConfig>
#include <KConfigGroup>
#include <xkbcommon/xkbcommon.h>

// kglobalaccel's key sequence on the bus: a struct of four combined keys, (ai).
struct KeySeq {
    QList<int> keys;
};
Q_DECLARE_METATYPE(KeySeq)

static QDBusArgument &operator<<(QDBusArgument &arg, const KeySeq &s)
{
    arg.beginStructure();
    arg << s.keys;
    arg.endStructure();
    return arg;
}

static const QDBusArgument &operator>>(const QDBusArgument &arg, KeySeq &s)
{
    arg.beginStructure();
    arg >> s.keys;
    arg.endStructure();
    return arg;
}

static KeySeq toBus(const QKeySequence &seq)
{
    KeySeq s;
    for (int i = 0; i < 4; ++i)
        s.keys << (i < seq.count() ? seq[i].toCombined() : 0);
    return s;
}

static QKeySequence fromBus(const KeySeq &s)
{
    const auto k = [&s](int i) { return QKeyCombination::fromCombined(s.keys.value(i)); };
    return QKeySequence(k(0), k(1), k(2), k(3));
}

static QDBusMessage kga(const QString &method, const QVariantList &args)
{
    auto msg = QDBusMessage::createMethodCall(QStringLiteral("org.kde.kglobalaccel"), QStringLiteral("/kglobalaccel"),
                                              QStringLiteral("org.kde.KGlobalAccel"), method);
    msg.setArguments(args);
    return QDBusConnection::sessionBus().call(msg);
}

// kglobalacceld looks an action up by component and name; the friendly names are not used.
static QStringList actionId(const QString &component, const QString &action)
{
    return {component, action, component, action};
}

static std::optional<QList<KeySeq>> keysOf(const QString &component, const QString &action)
{
    const auto reply = kga(QStringLiteral("shortcutKeys"), {actionId(component, action)});
    if (reply.type() != QDBusMessage::ReplyMessage || reply.arguments().isEmpty())
        return std::nullopt;
    return qdbus_cast<QList<KeySeq>>(reply.arguments().first().value<QDBusArgument>());
}

static bool setKeys(const QString &component, const QString &action, const QList<KeySeq> &keys)
{
    return kga(QStringLiteral("setForeignShortcutKeys"), {actionId(component, action), QVariant::fromValue(keys)}).type()
        == QDBusMessage::ReplyMessage;
}

bool kwinI3Loaded()
{
    auto msg = QDBusMessage::createMethodCall(QStringLiteral("org.kde.KWin"), QStringLiteral("/Scripting"),
                                              QStringLiteral("org.kde.kwin.Scripting"), QStringLiteral("isScriptLoaded"));
    msg << QStringLiteral("kwin-i3");
    const auto reply = QDBusConnection::sessionBus().call(msg);
    return reply.type() == QDBusMessage::ReplyMessage && reply.arguments().value(0).toBool();
}

// make take-keys' record (tools/take-keys.py), so make restore-keys gives back what the page took.
static QString takenPath()
{
    const QString state = qEnvironmentVariable("XDG_STATE_HOME", QDir::homePath() + QStringLiteral("/.local/state"));
    return state + QStringLiteral("/kwin-i3/taken-keys.json");
}

// The current layout's keymap, built as KWin builds it (xkb.cpp loadKeymapFromConfig: kxkbrc
// [Layout] Model, LayoutList, VariantList, Options), at the layout KWin is on (org.kde.keyboard).
// For each key that types something: its unshifted and Shift symbols as Qt keys (a printable
// character's Qt key is its uppercase code point), and the unshifted character as typed.
static QVariantList layoutTable()
{
    const KConfigGroup g = KConfig(QStringLiteral("kxkbrc")).group(QStringLiteral("Layout"));
    const QByteArray model = g.readEntry("Model", "pc104").toLatin1();
    QByteArray layout = g.readEntry("LayoutList").toLatin1();
    const QByteArray variant = g.readEntry("VariantList").toLatin1();
    const QByteArray options = g.readEntry("Options").toLatin1();
    if (layout.isEmpty())
        layout = "us";
    const xkb_rule_names names{nullptr, model.constData(), layout.constData(), variant.constData(), options.constData()};
    xkb_context *ctx = xkb_context_new(XKB_CONTEXT_NO_FLAGS);
    xkb_keymap *keymap = ctx ? xkb_keymap_new_from_names(ctx, &names, XKB_KEYMAP_COMPILE_NO_FLAGS) : nullptr;
    QVariantList out;
    if (keymap) {
        const QDBusMessage reply = QDBusConnection::sessionBus().call(QDBusMessage::createMethodCall(
            QStringLiteral("org.kde.keyboard"), QStringLiteral("/Layouts"), QStringLiteral("org.kde.KeyboardLayouts"), QStringLiteral("getLayout")));
        xkb_layout_index_t current = reply.type() == QDBusMessage::ReplyMessage && !reply.arguments().isEmpty() ? reply.arguments().first().toUInt() : 0;
        if (current >= xkb_keymap_num_layouts(keymap))
            current = 0;
        const auto sym = [&](int evdev, int level) -> char32_t {
            const xkb_keysym_t *syms = nullptr;
            return xkb_keymap_key_get_syms_by_level(keymap, evdev + 8, current, level, &syms) > 0 ? xkb_keysym_to_utf32(syms[0]) : 0;
        };
        const auto qtKey = [](char32_t c) { return int(QChar::toUpper(c)); };
        for (int evdev = 1; evdev < 64; ++evdev) {
            const char32_t base = sym(evdev, 0), up = sym(evdev, 1);
            if (base > 0x20 && up > 0x20)
                out << QVariant(QVariantList{qtKey(base), qtKey(up), int(base)});
        }
        xkb_keymap_unref(keymap);
    }
    if (ctx)
        xkb_context_unref(ctx);
    return out;
}

KeysModel::KeysModel(QObject *parent)
    : QAbstractListModel(parent)
{
    qDBusRegisterMetaType<KeySeq>();
    qDBusRegisterMetaType<QList<KeySeq>>();
}

int KeysModel::rowCount(const QModelIndex &parent) const
{
    return parent.isValid() ? 0 : m_rows.size();
}

QHash<int, QByteArray> KeysModel::roleNames() const
{
    return {{GroupRole, "group"}, {LabelRole, "label"}, {NoteRole, "note"}, {SlotsRole, "keySlots"}, {SettingRole, "setting"}};
}

QVariant KeysModel::data(const QModelIndex &index, int role) const
{
    if (!index.isValid() || index.row() >= m_rows.size())
        return {};
    const Row &row = m_rows[index.row()];
    switch (role) {
    case GroupRole:
        return row.group;
    case LabelRole:
        return row.label;
    case NoteRole:
        return row.note;
    case SettingRole:
        return row.setting;
    case SlotsRole: {
        QVariantList out;
        for (const Slot &s : row.entries)
            out << QVariantMap{{QStringLiteral("key"), s.pending},
                               {QStringLiteral("keyCode"), s.pending.isEmpty() ? 0 : s.pending[0].toCombined()},
                               {QStringLiteral("defaultCode"), s.def.isEmpty() ? 0 : s.def[0].toCombined()},
                               {QStringLiteral("keyText"), s.pending.toString(QKeySequence::NativeText)},
                               {QStringLiteral("defaultText"), s.def.toString(QKeySequence::NativeText)},
                               {QStringLiteral("holder"), s.holder.friendly}};
        return out;
    }
    }
    return {};
}

void KeysModel::load()
{
    beginResetModel();
    m_rows.clear();
    m_layoutTable = layoutTable();
    const bool was = m_available;
    m_available = kwinI3Loaded();
    if (m_available) {
        QFile f(QStringLiteral(":/kcm/kcm_kwin_i3/commands.json"));
        if (!f.open(QIODevice::ReadOnly))
            qFatal("kcm_kwin_i3: commands.json missing from the build");
        for (const auto group : QJsonDocument::fromJson(f.readAll()).array()) {
            for (const auto command : group[QStringLiteral("commands")].toArray()) {
                Row row{group[QStringLiteral("group")].toString(), command[QStringLiteral("label")].toString(),
                        command[QStringLiteral("note")].toString(), command[QStringLiteral("setting")].toString(), {}};
                for (const auto a : command[QStringLiteral("actions")].toArray()) {
                    Slot s;
                    s.action = a[0].toString();
                    s.def = QKeySequence::fromString(a[1].toString(), QKeySequence::PortableText);
                    const auto keys = keysOf(QStringLiteral("kwin"), s.action).value_or(QList<KeySeq>{});
                    s.current = keys.isEmpty() ? QKeySequence() : fromBus(keys.first());
                    s.pending = s.current;
                    row.entries << s;
                }
                m_rows << row;
            }
        }
    }
    endResetModel();
    if (was != m_available)
        Q_EMIT availableChanged();
}

void KeysModel::findHolders()
{
    for (Row &row : m_rows) {
        for (Slot &s : row.entries) {
            s.holder = {};
            if (s.pending.isEmpty() || s.pending == s.current)
                continue;
            const KeyHolder h = keyHolder(s.pending[0].toCombined());
            s.holder = {h.component, h.action, h.friendly};
        }
    }
}

QVariant KeysModel::shown(int row) const
{
    return data(index(row), SlotsRole);
}

void KeysModel::setKey(int r, int slot, const QKeySequence &key)
{
    if (r < 0 || r >= m_rows.size() || slot < 0 || slot >= m_rows[r].entries.size())
        return;
    QList<QVariant> before;
    for (int i = 0; i < m_rows.size(); ++i)
        before << shown(i);
    // A key is one command's: set here, it leaves any other row it was pending on.
    if (!key.isEmpty()) {
        for (Row &row : m_rows)
            for (Slot &s : row.entries)
                if (s.pending == key)
                    s.pending = QKeySequence();
    }
    m_rows[r].entries[slot].pending = key;
    findHolders();
    // Only the rows that changed: a reset row rebuilds its key items, and the one just edited
    // would lose the keyboard focus.
    for (int i = 0; i < m_rows.size(); ++i)
        if (shown(i) != before[i])
            Q_EMIT dataChanged(index(i), index(i));
    Q_EMIT changed();
}

static QJsonArray toJson(const QList<KeySeq> &keys)
{
    QJsonArray out;
    for (const KeySeq &k : keys)
        out << QJsonArray::fromVariantList({k.keys.value(0), k.keys.value(1), k.keys.value(2), k.keys.value(3)});
    return out;
}

static QList<KeySeq> fromJson(const QJsonArray &a)
{
    QList<KeySeq> out;
    for (const auto &k : a) {
        KeySeq s;
        for (const auto &v : k.toArray())
            s.keys << v.toInt();
        while (s.keys.size() < 4)
            s.keys << 0;
        out << s;
    }
    return out;
}

static QJsonObject readTaken()
{
    QFile f(takenPath());
    return f.open(QIODevice::ReadOnly) ? QJsonDocument::fromJson(f.readAll()).object() : QJsonObject();
}

static bool writeTaken(const QJsonObject &taken)
{
    if (taken.isEmpty())
        return !QFile::exists(takenPath()) || QFile::remove(takenPath());
    QDir().mkpath(QFileInfo(takenPath()).path());
    QSaveFile out(takenPath());
    return out.open(QIODevice::WriteOnly) && out.write(QJsonDocument(taken).toJson()) >= 0 && out.commit();
}

KeyHolder keyHolder(int code)
{
    const QStringList h = kga(QStringLiteral("action"), {code}).arguments().value(0).toStringList();
    if (h.size() < 4 || (h[0] == QLatin1String("kwin") && h[1].startsWith(QLatin1String("kwin-i3 "))))
        return {};
    return {h[0], h[1], i18nc("action (application)", "%1 (%2)", h[3], h[2])};
}

// A holder whose app isn't running doesn't block the key (as tools/take-keys.py).
bool componentActive(const QString &component)
{
    const auto path = kga(QStringLiteral("getComponent"), {component}).arguments().value(0).value<QDBusObjectPath>();
    if (path.path().isEmpty())
        return false;
    auto msg = QDBusMessage::createMethodCall(QStringLiteral("org.kde.kglobalaccel"), path.path(),
                                              QStringLiteral("org.kde.kglobalaccel.Component"), QStringLiteral("isActive"));
    return QDBusConnection::sessionBus().call(msg).arguments().value(0).toBool();
}

// Takes code from its holder, recorded first (an earlier record of the same holder is kept, as
// take-keys does): not recorded, not taken, since it couldn't be given back. After the take,
// "set" records what the holder was left with: a give-back writes the old keys only where the
// holder still has exactly that.
bool takeKey(const KeyHolder &h, int code)
{
    const auto keys = keysOf(h.component, h.action);
    if (!keys)
        return false;
    QJsonObject taken = readTaken();
    const QString id = h.component + QLatin1Char('|') + h.action;
    if (!taken.contains(id)) {
        taken[id] = QJsonObject{{QStringLiteral("component"), h.component},
                                {QStringLiteral("action"), h.action},
                                {QStringLiteral("keys"), toJson(*keys)}};
        if (!writeTaken(taken)) {
            qWarning("kcm_kwin_i3: can't write %s; %s keeps its key", qPrintable(takenPath()), qPrintable(id));
            return false;
        }
    }
    QList<KeySeq> kept;
    for (const KeySeq &k : *keys)
        if (k.keys.value(0) != code)
            kept << k;
    if (!setKeys(h.component, h.action, kept))
        return false;
    QJsonObject entry = taken[id].toObject();
    entry[QStringLiteral("set")] = toJson(keysOf(h.component, h.action).value_or(kept));
    taken[id] = entry;
    if (!writeTaken(taken))   // the take stands; a stale "set" only makes the give-back leave it
        qWarning("kcm_kwin_i3: can't write %s", qPrintable(takenPath()));
    return true;
}

static bool sameKeys(const QList<KeySeq> &a, const QList<KeySeq> &b)
{
    auto flat = [](const QList<KeySeq> &l) {
        QList<QList<int>> out;
        for (const auto &k : l)
            out << k.keys;
        std::sort(out.begin(), out.end());
        return out;
    };
    return flat(a) == flat(b);
}

QStringList takenIds()
{
    return readTaken().keys();
}

// As make restore-keys (tools/take-keys.py restore), for the records `which` accepts.
int giveBackKeys(const std::function<bool(const QString &id)> &which)
{
    QJsonObject taken = readTaken();
    int failed = 0;
    for (const QString &id : taken.keys()) {
        if (!which(id))
            continue;
        const QJsonObject e = taken[id].toObject();
        const QString c = e[QStringLiteral("component")].toString(), a = e[QStringLiteral("action")].toString();
        const auto now = keysOf(c, a);
        if (!now) {
            ++failed;
            continue;
        }
        const QList<KeySeq> old = fromJson(e[QStringLiteral("keys")].toArray());
        bool unchanged;
        if (e.contains(QStringLiteral("set")))
            unchanged = sameKeys(*now, fromJson(e[QStringLiteral("set")].toArray()));
        else
            unchanged = std::all_of(now->begin(), now->end(), [&old](const KeySeq &k) {
                return std::any_of(old.begin(), old.end(), [&k](const KeySeq &o) { return o.keys == k.keys; });
            });
        if (!sameKeys(*now, old) && unchanged && !setKeys(c, a, old)) {
            ++failed;
            continue;
        }
        taken.remove(id);   // given back, already back, or changed since (the user's: it stays)
    }
    writeTaken(taken);
    return failed;
}

void KeysModel::save()
{
    QStringList failed;
    for (const Row &row : m_rows) {
        for (const Slot &s : row.entries) {
            if (s.pending == s.current)
                continue;
            // A key another action holds is taken from it first. If that fails, kwin-i3's action
            // doesn't get it either: both would hold it, and the other one fires.
            if (!s.holder.component.isEmpty()
                && !takeKey(KeyHolder{s.holder.component, s.holder.action, s.holder.friendly}, s.pending[0].toCombined())) {
                failed << s.pending.toString(QKeySequence::NativeText);
                continue;
            }
            if (!setKeys(QStringLiteral("kwin"), s.action, s.pending.isEmpty() ? QList<KeySeq>{} : QList<KeySeq>{toBus(s.pending)}))
                failed << s.pending.toString(QKeySequence::NativeText);
        }
    }
    m_error = failed.isEmpty() ? QString() : i18n("These keys could not be set: %1.", failed.join(QStringLiteral(", ")));
    load();
    Q_EMIT changed();
}

void KeysModel::defaults()
{
    for (Row &row : m_rows)
        for (Slot &s : row.entries)
            s.pending = s.def;
    findHolders();
    if (!m_rows.isEmpty())
        Q_EMIT dataChanged(index(0), index(m_rows.size() - 1));
    Q_EMIT changed();
}

bool KeysModel::isSaveNeeded() const
{
    for (const Row &row : m_rows)
        for (const Slot &s : row.entries)
            if (s.pending != s.current)
                return true;
    return false;
}

bool KeysModel::isDefaults() const
{
    for (const Row &row : m_rows)
        for (const Slot &s : row.entries)
            if (s.pending != s.def)
                return false;
    return true;
}

QList<std::pair<int, QString>> KeysModel::currentKeys() const
{
    QList<std::pair<int, QString>> out;
    for (const Row &row : m_rows)
        for (const Slot &s : row.entries)
            if (!s.current.isEmpty())
                out.append({s.current[0].toCombined(), s.action});
    return out;
}
