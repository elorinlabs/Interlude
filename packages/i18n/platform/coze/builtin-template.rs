fn builtin_entries() -> Vec<Value> {
    vec![
        json!({"id":"builtin-knowledge-assistant","name":"知识问答助手",
        "description":"从资料库回答问题，附上可追溯的引用。选择模型并导入资料后即可使用。","builtin":true}),
    ]
}

/// Names, descriptions and the agent prompt of the built-in template in one language.
/// Installing copies them into the user's resources, so they are localized once, at install.
struct BuiltinCopy {
    name: &'static str,
    description: &'static str,
    knowledge_name: &'static str,
    knowledge_description: &'static str,
    agent_name: &'static str,
    agent_description: &'static str,
    agent_prompt: &'static str,
    app_name: &'static str,
    app_description: &'static str,
}

const BUILTIN_ZH: BuiltinCopy = BuiltinCopy {
    name: "知识问答助手",
    description: "回答资料中的问题，附上引用。",
    knowledge_name: "问答资料",
    knowledge_description: "导入助手需要参考的资料。",
    agent_name: "资料助手",
    agent_description: "从资料库回答问题。",
    agent_prompt: "根据资料回答问题并引用出处。没有依据时请说明。",
    app_name: "知识问答应用",
    app_description: "包含资料库和问答助手。",
};

const BUILTIN_EN: BuiltinCopy = BuiltinCopy {
    name: "Knowledge Q&A assistant",
    description: "Answers questions from your materials with citations.",
    knowledge_name: "Q&A materials",
    knowledge_description: "Import the materials the assistant should refer to.",
    agent_name: "Materials assistant",
    agent_description: "Answers questions from the knowledge base.",
    agent_prompt: "Answer questions based on the materials and cite your sources. \
        If the materials don't support an answer, say so.",
    app_name: "Knowledge Q&A app",
    app_description: "Includes the knowledge base and the Q&A assistant.",
};

const BUILTIN_RU: BuiltinCopy = BuiltinCopy {
    name: "Помощник по базе знаний",
    description: "Отвечает на вопросы по материалам и приводит ссылки на источники.",
    knowledge_name: "Материалы для ответов",
    knowledge_description: "Импортируйте материалы, на которые будет опираться помощник.",
    agent_name: "Помощник по материалам",
    agent_description: "Отвечает на вопросы по базе знаний.",
    agent_prompt: "Отвечайте на вопросы по материалам и указывайте источники. \
        Если в материалах нет ответа, сообщите об этом.",
    app_name: "Приложение для ответов по базе знаний",
    app_description: "Включает базу знаний и помощника для ответов на вопросы.",
};

/// `en` and `ru` select a translation; anything else, including no language, keeps Chinese.
fn builtin_copy(language: Option<&str>) -> &'static BuiltinCopy {
    match language {
        Some("en") => &BUILTIN_EN,
        Some("ru") => &BUILTIN_RU,
        _ => &BUILTIN_ZH,
    }
}
