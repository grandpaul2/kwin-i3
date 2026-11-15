// prettier for the JS and JSON (tools/lint.sh); every other option is prettier's default.
export default {
    // 4, as KDE's C++ and the QML beside it.
    tabWidth: 4,
    // No comma after a call's last argument (ES2017): the script runs in KWin's QJSEngine and
    // kcm/ui's and the widget's JS in Plasma's QML engine, on the user's Qt, older than the Qt
    // this was checked on.
    trailingComma: "es5",
};
