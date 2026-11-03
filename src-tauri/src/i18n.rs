//! Copy for the two shipped locales, so the tray, window title and
//! notifications follow the language picked in Settings.

pub struct Labels {
    pub app_title: &'static str,
    pub tray_open: &'static str,
    pub tray_closeout: &'static str,
    pub tray_quit: &'static str,
    pub morning_title: &'static str,
    pub morning_empty: &'static str,
    pub morning_stuck: &'static str,
    pub morning_plan: &'static str,
    pub evening_title: &'static str,
    pub evening_body: &'static str,
}

pub const ZH: Labels = Labels {
    app_title: "琐记",
    tray_open: "打开琐记",
    tray_closeout: "收工结账",
    tray_quit: "退出",
    morning_title: "琐记 · 今天的事",
    morning_empty: "今天还没排事情。要不要从收件箱挑几件？",
    morning_stuck: "今天 {pending} 件。其中「{title}」已经挂好几天了。",
    morning_plan: "今天要处理 {pending} 件事，打开捋一下。",
    evening_title: "琐记 · 收工结账",
    evening_body: "还有 {pending} 件没勾掉，结个账，顺手挪到明天。",
};

pub const EN: Labels = Labels {
    app_title: "Suoji",
    tray_open: "Open Suoji",
    tray_closeout: "Close the day",
    tray_quit: "Quit",
    morning_title: "Suoji · Today",
    morning_empty: "Nothing planned yet. Pick a few from the inbox?",
    morning_stuck: "Today: {pending}. \"{title}\" has been sitting for days.",
    morning_plan: "Today: {pending} things. Open it and sort them out.",
    evening_title: "Suoji · Close out",
    evening_body: "{pending} still unchecked. Close the day and roll them over.",
};

pub fn labels(locale: &str) -> &'static Labels {
    if locale == "en" {
        &EN
    } else {
        &ZH
    }
}

/// Fill `{name}` placeholders in a template.
pub fn fill(template: &str, vars: &[(&str, &str)]) -> String {
    let mut out = template.to_string();
    for (name, value) in vars {
        out = out.replace(&format!("{{{name}}}"), value);
    }
    out
}
