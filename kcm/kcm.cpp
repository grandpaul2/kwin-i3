// kcm_kwin_i3: kwin-i3's page in System Settings > Window Management (docs/spec-settings-page.md).
// The settings are the script's own (main.xml, kwinrc [Script-kwin-i3]); Apply writes them and
// asks KWin to reconfigure, which reaches the script and the plugins, so it takes effect with or
// without the plugins. The keys are on a sub-page (keys.cpp).

#include "keys.h"
#include "kwini3settings.h"

#include <KConfigGroup>
#include <KPluginFactory>
#include <KQuickManagedConfigModule>
#include <KSharedConfig>

#include <QDBusConnection>
#include <QDBusMessage>
#include <QDBusPendingCall>
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
    Q_PROPERTY(bool frameSelected MEMBER m_frameSelected NOTIFY stateChanged)

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

    Q_INVOKABLE void refresh()
    {
        auto config = KSharedConfig::openConfig(QStringLiteral("kwinrc"));
        config->reparseConfiguration();
        m_scriptEnabled = KConfigGroup(config, QStringLiteral("Plugins")).readEntry("kwin-i3Enabled", false);
        m_frameSelected = KConfigGroup(config, QStringLiteral("org.kde.kdecoration2"))
                              .readEntry("library", QString())
                              .startsWith(QLatin1String("kwini3frame"));
        auto msg = QDBusMessage::createMethodCall(QStringLiteral("org.kde.KWin"), QStringLiteral("/Scripting"),
                                                  QStringLiteral("org.kde.kwin.Scripting"), QStringLiteral("isScriptLoaded"));
        msg << QStringLiteral("kwin-i3");
        m_scriptLoaded = QDBusConnection::sessionBus().call(msg).arguments().value(0).toBool();
        // The installed effect's id carries a hash (tools/plugin-install.sh): kwini3hold-<hash>.
        auto prop = QDBusMessage::createMethodCall(QStringLiteral("org.kde.KWin"), QStringLiteral("/Effects"),
                                                   QStringLiteral("org.freedesktop.DBus.Properties"), QStringLiteral("Get"));
        prop << QStringLiteral("org.kde.kwin.Effects") << QStringLiteral("loadedEffects");
        const QStringList effects = QDBusConnection::sessionBus().call(prop).arguments().value(0).value<QDBusVariant>().variant().toStringList();
        m_holdLoaded = std::any_of(effects.begin(), effects.end(), [](const QString &e) {
            return e.startsWith(QLatin1String("kwini3hold"));
        });
        m_keys->load();
        Q_EMIT stateChanged();
        settingsChanged();
    }

Q_SIGNALS:
    void stateChanged();

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
    bool m_frameSelected = false;
};

K_PLUGIN_CLASS_WITH_JSON(KWinI3Kcm, "kcm_kwin_i3.json")

#include "kcm.moc"
