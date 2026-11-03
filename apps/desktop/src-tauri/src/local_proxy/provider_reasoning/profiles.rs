use crate::{models::ReasoningEffort, providers::known_model_reasoning_efforts};

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Dialect {
    OpenRouter,
    DeepSeek,
    Moonshot,
    Glm,
    DashScope,
    SiliconFlow,
    ModelScope,
    MiniMax,
}

impl Dialect {
    pub(super) fn from_base_url(base_url: &str) -> Option<Self> {
        let url = url::Url::parse(base_url).ok()?;
        let host = url.host_str()?.trim_end_matches('.');
        match host {
            "openrouter.ai" => Some(Self::OpenRouter),
            "api.deepseek.com" => Some(Self::DeepSeek),
            "api.moonshot.cn" | "api.moonshot.ai" => Some(Self::Moonshot),
            "open.bigmodel.cn" | "api.z.ai" => Some(Self::Glm),
            "api.minimaxi.com" | "api.minimax.io" => Some(Self::MiniMax),
            "api.siliconflow.cn" | "api.siliconflow.com" => Some(Self::SiliconFlow),
            "api-inference.modelscope.cn" => Some(Self::ModelScope),
            "dashscope.aliyuncs.com" => Some(Self::DashScope),
            _ if host.ends_with(".dashscope.aliyuncs.com")
                || host.ends_with(".maas.aliyuncs.com") =>
            {
                Some(Self::DashScope)
            }
            _ => None,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Switch {
    Thinking,
    Enabled,
    Split,
}

#[derive(Clone, Copy)]
pub(super) enum EffortRule {
    Toggle,
    DeepSeek,
    HighMax,
    Glm,
    Qwen,
}

impl EffortRule {
    pub(super) fn map(self, effort: &str) -> Option<&'static str> {
        match self {
            Self::Toggle => None,
            Self::DeepSeek => match effort {
                "none" | "minimal" | "low" => Some("low"),
                "max" | "ultra" => Some("max"),
                _ => Some("high"),
            },
            Self::HighMax => match effort {
                "xhigh" | "max" | "ultra" => Some("max"),
                _ => Some("high"),
            },
            Self::Glm => match effort {
                "none" | "minimal" | "low" => Some("low"),
                "xhigh" | "max" | "ultra" => Some("max"),
                _ => Some("high"),
            },
            Self::Qwen => match effort {
                "none" | "minimal" | "low" => Some("low"),
                "medium" => Some("medium"),
                _ => Some("xhigh"),
            },
        }
    }
}

pub(super) struct Profile {
    pub(super) switch: Switch,
    pub(super) effort: EffortRule,
    pub(super) always_thinks: bool,
}

pub(super) fn for_model(dialect: Dialect, model: &str) -> Option<Profile> {
    let model = model.rsplit('/').next()?;
    let mut profile = model_profile(model)?;
    match dialect {
        Dialect::DeepSeek if model.starts_with("deepseek-") => {}
        Dialect::Moonshot if model.starts_with("kimi-") => {}
        Dialect::Glm if model.starts_with("glm-") => {}
        Dialect::MiniMax if model.starts_with("minimax-") => {}
        Dialect::DashScope if !model.starts_with("minimax-") => {
            profile.switch = Switch::Enabled;
            if model.starts_with("deepseek-") {
                profile.effort = EffortRule::HighMax;
            }
        }
        Dialect::SiliconFlow if !model.starts_with("minimax-") => {
            profile.switch = Switch::Enabled;
            profile.effort = if model.starts_with("deepseek-v4-") || model == "glm-5.2" {
                EffortRule::HighMax
            } else {
                EffortRule::Toggle
            };
        }
        Dialect::ModelScope if model.starts_with("qwen") => {
            profile.switch = Switch::Enabled;
            profile.effort = EffortRule::Toggle;
        }
        _ => return None,
    }
    Some(profile)
}

fn model_profile(model: &str) -> Option<Profile> {
    let defaults = known_model_reasoning_efforts(model);
    if defaults.is_none() && !LEGACY_THINKING_MODELS.contains(&model) {
        return None;
    }
    let always_thinks = defaults.is_some_and(|efforts| !efforts.contains(&ReasoningEffort::None));
    let (switch, effort) = if model.starts_with("deepseek-") {
        (Switch::Thinking, EffortRule::DeepSeek)
    } else if model.starts_with("glm-") {
        (Switch::Thinking, glm_effort(model))
    } else if model.starts_with("kimi-") {
        (Switch::Thinking, EffortRule::Toggle)
    } else if model.starts_with("minimax-") {
        (Switch::Split, EffortRule::Toggle)
    } else if model.starts_with("qwen") {
        (
            Switch::Enabled,
            if model.starts_with("qwen3.8-") {
                EffortRule::Qwen
            } else {
                EffortRule::Toggle
            },
        )
    } else {
        return None;
    };
    Some(Profile {
        switch,
        effort,
        always_thinks,
    })
}

fn glm_effort(model: &str) -> EffortRule {
    match model {
        "glm-5.3" | "glm-5.3-flash" => EffortRule::Glm,
        "glm-5.2" => EffortRule::HighMax,
        _ => EffortRule::Toggle,
    }
}

// These established models predate the bundled capability catalog. Keep matching exact.
const LEGACY_THINKING_MODELS: &[&str] = &[
    "deepseek-chat",
    "deepseek-reasoner",
    "glm-4.5",
    "glm-4.5-air",
    "glm-4.6",
    "glm-4.7",
    "glm-4.7-flash",
    "minimax-m2",
    "minimax-m2.1",
    "minimax-m2.1-highspeed",
    "minimax-m2.5-highspeed",
    "minimax-m2.7-highspeed",
    "qwen-plus",
    "qwen-flash",
    "qwen3-235b-a22b",
    "qwen3-30b-a3b",
    "qwen3-32b",
    "qwen3-14b",
    "qwen3-8b",
    "qwen3-4b",
    "qwen3-1.7b",
    "qwen3-0.6b",
    "qwen3-max-2026-01-23",
    "qwen3.5-plus",
    "qwen3.6-plus",
    "qwen3.7-plus",
];
