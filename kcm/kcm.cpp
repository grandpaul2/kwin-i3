// kcm_kwin_i3: kwin-i3's page in System Settings > Window Management (docs/records/spec-settings-page.md).
// The settings are the script's own (main.xml, kwinrc [Script-kwin-i3]); Apply writes them and
// asks KWin to reconfigure, which reaches the script and the plugins, so it takes effect with or
// without the plugins. The keys are on a sub-page (keys.cpp).

#include "keys.h"
#include "kwini3settings.h"

#include <KApplicationTrader>
#include <KConfigGroup>
#include <KPluginFactory>
#include <KQuickManagedConfigModule>
#include <KService>
#include <KSharedConfig>

#include <QDBusConnection>
#include <QDBusMessage>
#include <QDBusPendingCall>
#include <QDBusPendingCallWatcher>
#include <QDBusPendingReply>
#include <QDBusVariant>
#include <QQmlEngine>
#include <QTimer>

class KWinI3Kcm : public KQuickManagedConfigModule
{
    Q_OBJECT
    Q_PROPERTY(KWinI3Settings *settings READ settings CONSTANT)
    Q_PROPERTY(KeysModel *keys READ keys CONSTANT)
    Q_PROPERTY(bool scriptEnabled MEMBER m_scriptEnabled NOTIFY stateChanged)
    Q_PROPERTY(bool scriptLoaded MEMBER m_scriptLoaded NOTIFY stateChanged)
    Q_PROPERTY(bool holdLoaded MEMBER m_holdLoaded NOTIFY stateChanged)
    Q_PROPERTY(bool helperLoaded MEMBER m_helperLoaded NOTIFY stateChanged)
    Q_PROPERTY(bool frameAvailable MEMBER m_frameAvailable NOTIFY stateChanged)

public:
    KWinI3Kcm(QObject *parent, const KPluginMetaData &data)
        : KQuickManagedConfigModule(parent, data)
        , m_settings(new KWinI3Settings(this))
        , m_keys(new KeysModel(this))
    {
        qmlRegisterAnonymousType<KWinI3Settings>("org.kde.kwini3", 1);
        qmlRegisterAnonymousType<KeysModel>("org.kde.kwini3", 1);
        setButtons(Apply | Default);
        connect(m_keys, &KeysModel::changed, this, &KWinI3Kcm::settingsChanged);
    }

    KWinI3Settings *settings() const { return m_settings; }
    KeysModel *keys() const { return m_keys; }

    void load() override
    {
        KQuickManagedConfigModule::load();
        refresh();
    }

    void save() override
    {
        // Keys take effect in kglobalaccel; only a setting needs KWin to re-read kwinrc.
        const bool settings = m_settings->isSaveNeeded();
        KQuickManagedConfigModule::save();
        m_keys->save();
        if (settings)
            reconfigure();
        settingsChanged();
    }

    void defaults() override
    {
        KQuickManagedConfigModule::defaults();
        m_keys->defaults();
    }

    // The script is off: turn it on (as KWin Scripts' checkbox does) and have KWin load it.
    Q_INVOKABLE void enableScript()
    {
        KConfigGroup plugins(KSharedConfig::openConfig(QStringLiteral("kwinrc")), QStringLiteral("Plugins"));
        plugins.writeEntry("kwin-i3Enabled", true);
        plugins.sync();
        reconfigure();
        // KWin answers reconfigure at once but starts scripts on its next event loop turn and
        // says nothing when it has; the page shows the state again a moment later.
        QTimer::singleShot(1000, this, &KWinI3Kcm::refresh);
    }

    // A setting's default as main.xml has it: the Window Rules sub-page marks default entries.
    Q_INVOKABLE QVariant defaultValue(const QString &key) const
    {
        const KConfigSkeletonItem *item = m_settings->findItem(key);
        return item ? item->getDefault() : QVariant();
    }

    // The installed applications, by name, each with the window class its windows have (the
    // Window Rules sub-page's application chooser): a Wayland app id is its desktop file's name;
    // an X11 window's class is the StartupWMClass, which KWin reads lowercased. One entry per
    // class, sorted by name.
    Q_INVOKABLE QVariantList applications() const
    {
        QMap<QString, QPair<QString, QString>> byClass;         // class -> (sort key, name)
        const auto apps = KApplicationTrader::query([](const KService::Ptr &p) {
            return !p->noDisplay() && !p->exec().isEmpty();
        });
        for (const KService::Ptr &p : apps) {
            const QString wm = p->property<QString>(QStringLiteral("StartupWMClass"));
            // The file name as it is (desktopEntryName may lowercase it: "Alacritty").
            QString file = p->storageId();
            if (file.endsWith(QLatin1String(".desktop")))
                file.chop(8);
            const QString cls = wm.isEmpty() ? file : wm.toLower();
            if (!cls.isEmpty() && !byClass.contains(cls))
                byClass.insert(cls, {p->name().toLower(), p->name()});
        }
        QList<QPair<QString, QVariantMap>> sorted;
        for (auto it = byClass.cbegin(); it != byClass.cend(); ++it)
            sorted.append({it.value().first, QVariantMap{{QStringLiteral("name"), it.value().second}, {QStringLiteral("id"), it.key()}}});
        std::sort(sorted.begin(), sorted.end(), [](const auto &x, const auto &y) { return x.first < y.first; });
        QVariantList out;
        for (const auto &e : sorted)
            out << e.second;
        return out;
    }

    // Pick a Window (the Window Rules sub-page): KWin's interactive selection, as Window Rules'
    // Detect Window Properties uses it (dbusinterface.cpp queryWindowInfo). The user clicks a
    // window; its class, name, role and title come back, or nothing (Escape, or a window KWin
    // doesn't manage).
    Q_INVOKABLE void pickWindow()
    {
        auto msg = QDBusMessage::createMethodCall(QStringLiteral("org.kde.KWin"), QStringLiteral("/KWin"),
                                                  QStringLiteral("org.kde.KWin"), QStringLiteral("queryWindowInfo"));
        auto *watcher = new QDBusPendingCallWatcher(QDBusConnection::sessionBus().asyncCall(msg, -1), this);
        connect(watcher, &QDBusPendingCallWatcher::finished, this, [this](QDBusPendingCallWatcher *w) {
            QDBusPendingReply<QVariantMap> reply = *w;
            w->deleteLater();
            if (reply.isError())
                Q_EMIT windowPickFailed(reply.error().name());
            else
                Q_EMIT windowPicked(reply.value());
        });
    }

    Q_INVOKABLE void refresh()
    {
        auto config = KSharedConfig::openConfig(QStringLiteral("kwinrc"));
        config->reparseConfiguration();
        m_scriptEnabled = KConfigGroup(config, QStringLiteral("Plugins")).readEntry("kwin-i3Enabled", false);
        m_scriptLoaded = kwinI3Loaded();
        // The installed effect's id carries a hash (tools/plugin-install.sh): kwini3hold-<hash>.
        auto prop = QDBusMessage::createMethodCall(QStringLiteral("org.kde.KWin"), QStringLiteral("/Effects"),
                                                   QStringLiteral("org.freedesktop.DBus.Properties"), QStringLiteral("Get"));
        prop << QStringLiteral("org.kde.kwin.Effects") << QStringLiteral("loadedEffects");
        const QStringList effects = QDBusConnection::sessionBus().call(prop).arguments().value(0).value<QDBusVariant>().variant().toStringList();
        m_holdLoaded = std::any_of(effects.begin(), effects.end(), [](const QString &e) {
            return e.startsWith(QLatin1String("kwini3hold"));
        });
        m_frameAvailable = m_holdLoaded;    // the effect draws the frame (docs/records/spec-window-modes.md)
        // The helper (kwini3helper, a KWin plugin): the tiling drag and resize, frame focus, the
        // resize mode, the layout keys, the Configure form's Apply (redo stage 10, call 40).
        auto plugins = QDBusMessage::createMethodCall(QStringLiteral("org.kde.KWin"), QStringLiteral("/Plugins"),
                                                      QStringLiteral("org.freedesktop.DBus.Properties"), QStringLiteral("Get"));
        plugins << QStringLiteral("org.kde.KWin.Plugins") << QStringLiteral("LoadedPlugins");
        const QStringList loaded = QDBusConnection::sessionBus().call(plugins).arguments().value(0).value<QDBusVariant>().variant().toStringList();
        // Installed, its id carries a hash too (kwini3helper-<hash>); the test KWin's has none.
        m_helperLoaded = std::any_of(loaded.begin(), loaded.end(), [](const QString &p) {
            return p.startsWith(QLatin1String("kwini3helper"));
        });
        m_keys->load();
        Q_EMIT stateChanged();
        settingsChanged();
    }

Q_SIGNALS:
    void stateChanged();
    void windowPicked(const QVariantMap &info);
    void windowPickFailed(const QString &error);

private:
    bool isSaveNeeded() const override { return m_keys->isSaveNeeded(); }
    bool isDefaults() const override { return m_keys->isDefaults(); }

    static void reconfigure()
    {
        QDBusConnection::sessionBus().asyncCall(QDBusMessage::createMethodCall(
            QStringLiteral("org.kde.KWin"), QStringLiteral("/KWin"), QStringLiteral("org.kde.KWin"), QStringLiteral("reconfigure")));
    }

    KWinI3Settings *m_settings;
    KeysModel *m_keys;
    bool m_scriptEnabled = false;
    bool m_scriptLoaded = false;
    bool m_holdLoaded = false;
    bool m_helperLoaded = false;
    bool m_frameAvailable = false;
};

K_PLUGIN_CLASS_WITH_JSON(KWinI3Kcm, "kcm_kwin_i3.json")

#include "kcm.moc"
