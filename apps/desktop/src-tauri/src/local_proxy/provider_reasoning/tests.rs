use super::*;

fn provider(base_url: &str, model: &str) -> ProviderProfile {
    serde_json::from_value(json!({
        "id": "reasoning-test", "name": "Reasoning test", "baseUrl": base_url,
        "apiKey": "", "model": model, "apiFormat": "openaiChat"
    }))
    .unwrap()
}

fn adapt(base_url: &str, model: &str, effort: &str) -> Value {
    let body = json!({ "model": model, "reasoning": { "effort": effort } });
    let mut chat = json!({ "model": model, "reasoning_effort": effort });
    apply(&body, &mut chat, &provider(base_url, model));
    chat
}

#[test]
fn hosted_kimi_uses_the_platform_contract() {
    let cases = [
        (
            "https://api.moonshot.ai/v1",
            "/thinking/type",
            json!("disabled"),
        ),
        (
            "https://coding.dashscope.aliyuncs.com/v1",
            "/enable_thinking",
            json!(false),
        ),
        (
            "https://api.siliconflow.cn/v1",
            "/enable_thinking",
            json!(false),
        ),
        (
            "https://openrouter.ai/api/v1",
            "/reasoning/effort",
            json!("none"),
        ),
    ];
    for (base_url, pointer, expected) in cases {
        let chat = adapt(base_url, "moonshotai/kimi-k2.5", "none");
        assert_eq!(chat.pointer(pointer), Some(&expected), "{base_url}");
        assert!(chat.get("reasoning_effort").is_none(), "{base_url}");
    }
}

#[test]
fn qwen_and_glm_switches_support_enabled_and_disabled_modes() {
    let cases = [
        (
            "https://dashscope.aliyuncs.com/compatible-mode/v1",
            "qwen3.7-plus",
            "/enable_thinking",
        ),
        (
            "https://api-inference.modelscope.cn/v1",
            "Qwen/Qwen3-32B",
            "/enable_thinking",
        ),
        ("https://api.z.ai/api/paas/v4", "glm-4.7", "/thinking/type"),
    ];
    for (base_url, model, pointer) in cases {
        for effort in ["none", "high"] {
            let chat = adapt(base_url, model, effort);
            let expected = if pointer.ends_with("type") {
                json!(if effort == "none" {
                    "disabled"
                } else {
                    "enabled"
                })
            } else {
                json!(effort != "none")
            };
            assert_eq!(chat.pointer(pointer), Some(&expected), "{model}: {effort}");
            assert!(chat.get("reasoning_effort").is_none());
        }
    }
}

#[test]
fn deepseek_efforts_follow_the_documented_mapping() {
    for (requested, expected) in [
        ("minimal", "low"),
        ("low", "low"),
        ("medium", "high"),
        ("high", "high"),
        ("xhigh", "high"),
        ("max", "max"),
        ("ultra", "max"),
    ] {
        let chat = adapt("https://api.deepseek.com/v1", "deepseek-v4-pro", requested);
        assert_eq!(chat["reasoning_effort"], expected, "{requested}");
        assert_eq!(chat["thinking"]["type"], "enabled");
    }
    let chat = adapt("https://api.deepseek.com/v1", "deepseek-v4-pro", "none");
    assert_eq!(chat["thinking"]["type"], "disabled");
    assert!(chat.get("reasoning_effort").is_none());
}

#[test]
fn siliconflow_deepseek_effort_does_not_use_the_official_mapping() {
    let chat = adapt(
        "https://api.siliconflow.com/v1",
        "deepseek-ai/DeepSeek-V4-Flash",
        "xhigh",
    );
    assert_eq!(chat["reasoning_effort"], "max");
    assert_eq!(chat["enable_thinking"], true);
    assert!(chat.get("thinking").is_none());
    let chat = adapt(
        "https://dashscope.aliyuncs.com/v1",
        "deepseek-v4-pro",
        "xhigh",
    );
    assert_eq!(chat["reasoning_effort"], "max");
    assert_eq!(chat["enable_thinking"], true);
}

#[test]
fn always_thinking_glm_keeps_a_valid_effort_when_none_is_requested() {
    for model in ["glm-5.3", "glm-5.3-flash"] {
        for (requested, expected) in [("none", "low"), ("high", "high"), ("ultra", "max")] {
            let chat = adapt("https://open.bigmodel.cn/api/paas/v4", model, requested);
            assert_eq!(chat["thinking"]["type"], "enabled");
            assert_eq!(chat["reasoning_effort"], expected);
        }
    }
    let chat = adapt("https://api.moonshot.cn/v1", "kimi-k2.7-code", "none");
    assert_eq!(chat["thinking"]["type"], "enabled");
    assert!(chat.get("reasoning_effort").is_none());
}

#[test]
fn qwen_multilevel_models_map_to_supported_efforts() {
    for (requested, expected) in [
        ("low", "low"),
        ("medium", "medium"),
        ("high", "xhigh"),
        ("ultra", "xhigh"),
    ] {
        let chat = adapt(
            "https://dashscope.aliyuncs.com/v1",
            "qwen3.8-27b",
            requested,
        );
        assert_eq!(chat["reasoning_effort"], expected);
        assert_eq!(chat["enable_thinking"], true);
    }
    let chat = adapt("https://dashscope.aliyuncs.com/v1", "qwen3.8-27b", "none");
    assert_eq!(chat["enable_thinking"], false);
    assert!(chat.get("reasoning_effort").is_none());
}

#[test]
fn minimax_separates_output_without_claiming_to_disable_thinking() {
    for effort in ["none", "high", "ultra"] {
        let chat = adapt("https://api.minimax.io/v1", "MiniMax-M2.5", effort);
        assert_eq!(chat["reasoning_split"], true);
        assert!(chat.get("thinking").is_none());
        assert!(chat.get("reasoning_effort").is_none());
    }
    let mut chat = json!({ "model": "MiniMax-M2.7" });
    apply(
        &json!({}),
        &mut chat,
        &provider("https://api.minimaxi.com/v1", "MiniMax-M2.7"),
    );
    assert_eq!(chat["reasoning_split"], true);
}

#[test]
fn unknown_hosts_and_models_preserve_custom_efforts() {
    let cases = [
        ("https://gateway.example/v1", "glm-5.3"),
        ("https://api.openai.com/v1", "kimi-k2.5"),
        ("https://api.moonshot.ai.example/v1", "kimi-k2.5"),
        ("https://api.moonshot.ai@elsewhere.example/v1", "kimi-k2.5"),
        ("https://gateway.example/api.moonshot.ai", "kimi-k2.5"),
        ("https://api.deepseek.com/v1", "deepseek-v99"),
        ("https://api.z.ai/api/paas/v4", "glm-5.30"),
        ("https://api.moonshot.ai/v1", "gpt-5.5"),
        ("https://dashscope.aliyuncs.com/v1", "qwen2.5-72b-instruct"),
    ];
    for (base_url, model) in cases {
        let chat = adapt(base_url, model, "ultra");
        assert_eq!(
            chat,
            json!({ "model": model, "reasoning_effort": "ultra" }),
            "{base_url}"
        );
    }
}

#[test]
fn balance_configuration_does_not_override_the_upstream_host() {
    let mut provider = provider("https://gateway.example/v1", "deepseek-v4-pro");
    provider.balance_platform = Some(crate::models::ProviderBalancePlatform::DeepSeek);
    let body = json!({ "reasoning": { "effort": "ultra" } });
    let mut chat = json!({ "model": "deepseek-v4-pro", "reasoning_effort": "ultra" });
    apply(&body, &mut chat, &provider);
    assert_eq!(chat["reasoning_effort"], "ultra");
    assert!(chat.get("thinking").is_none());
}

#[test]
fn existing_native_controls_are_preserved() {
    let body = json!({ "reasoning": { "effort": "high" }, "thinking": { "type": "disabled", "keep": "all" } });
    let mut chat = json!({ "model": "kimi-k2.6", "reasoning_effort": "high" });
    apply(
        &body,
        &mut chat,
        &provider("https://api.moonshot.ai/v1", "kimi-k2.6"),
    );
    assert_eq!(chat["thinking"], body["thinking"]);
    assert!(chat.get("reasoning_effort").is_none());

    let mut chat = json!({ "model": "qwen3.8-flash", "enable_thinking": false });
    apply(
        &body,
        &mut chat,
        &provider("https://dashscope.aliyuncs.com/v1", "qwen3.8-flash"),
    );
    assert_eq!(chat["enable_thinking"], false);
    assert!(chat.get("reasoning_effort").is_none());

    let mut chat = json!({ "model": "minimax-m2.5", "reasoning_split": false });
    apply(
        &body,
        &mut chat,
        &provider("https://api.minimax.io/v1", "minimax-m2.5"),
    );
    assert_eq!(chat["reasoning_split"], false);
}

#[test]
fn qwen_budget_does_not_conflict_with_an_inferred_effort() {
    let body = json!({ "reasoning": { "effort": "high" }, "thinking_budget": 4096 });
    let mut chat = json!({ "model": "qwen3.8-max", "reasoning_effort": "high" });
    apply(
        &body,
        &mut chat,
        &provider("https://dashscope.aliyuncs.com/v1", "qwen3.8-max"),
    );
    assert_eq!(chat["thinking_budget"], 4096);
    assert!(chat.get("reasoning_effort").is_none());
}

#[test]
fn router_keeps_custom_effort_and_supported_options() {
    let body = json!({ "reasoning": { "effort": "ultra", "exclude": false, "summary": "auto" } });
    let mut chat = json!({ "model": "z-ai/glm-5.3", "reasoning_effort": "ultra" });
    apply(
        &body,
        &mut chat,
        &provider("https://openrouter.ai/api/v1", "z-ai/glm-5.3"),
    );
    assert_eq!(
        chat["reasoning"],
        json!({ "effort": "ultra", "exclude": false })
    );
    assert!(chat.get("reasoning_effort").is_none());
}

#[test]
fn router_respects_explicit_budget_disabled_and_preexisting_settings() {
    for reasoning in [
        json!({ "max_tokens": 4096 }),
        json!({ "enabled": false }),
        json!({ "effort": "low" }),
    ] {
        let body = json!({ "reasoning": { "effort": "high" } });
        let mut chat = json!({ "reasoning": reasoning, "reasoning_effort": "high" });
        apply(
            &body,
            &mut chat,
            &provider("https://openrouter.ai/api/v1", "any-model"),
        );
        assert_eq!(chat["reasoning"], reasoning);
        assert!(chat.get("reasoning_effort").is_none());
    }
}

#[test]
fn absent_effort_keeps_the_upstream_default() {
    let body = json!({ "input": "Hello" });
    let mut chat = json!({ "model": "glm-5.3" });
    let expected = chat.clone();
    apply(
        &body,
        &mut chat,
        &provider("https://open.bigmodel.cn/api/paas/v4", "glm-5.3"),
    );
    assert_eq!(chat, expected);
}

#[test]
fn selected_request_model_takes_precedence_over_provider_default() {
    let body = json!({ "reasoning": { "effort": "none" } });
    let mut chat = json!({ "model": "glm-5.3", "reasoning_effort": "none" });
    apply(
        &body,
        &mut chat,
        &provider("https://open.bigmodel.cn/api/paas/v4", "glm-4.7"),
    );
    assert_eq!(chat["thinking"]["type"], "enabled");
    assert_eq!(chat["reasoning_effort"], "low");
}
