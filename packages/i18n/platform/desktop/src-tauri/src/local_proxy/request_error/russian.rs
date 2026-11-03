//! Russian rendering of structured proxy request errors. The Chinese `Display` in the parent
//! module stays canonical; this module renders the same safe enums for the Russian interface
//! and never consults the saved language itself.
use std::fmt;

use super::{upstream::Failure, Cause, JsonKind, Problem, ReadFailure, RequestError, Stage};

/// Writes `error` in Russian. Callers choose the language.
pub(super) fn fmt(error: &RequestError, f: &mut impl fmt::Write) -> fmt::Result {
    write!(f, "Не удалось {}. ", stage_text(error.stage))?;
    match error.cause {
        Cause::Problem(problem) => f.write_str(problem_text(problem))?,
        Cause::Json { kind, line, column } => {
            write!(f, "{} (строка {line}, столбец {column}).", json_text(kind))?
        }
        Cause::Read(kind) => f.write_str(read_text(kind))?,
        Cause::Http(status) => write!(f, "Сервис вернул HTTP {status}: {}.", http_reason(status))?,
        Cause::Upstream(reason) => f.write_str(upstream_text(reason))?,
        Cause::Transport(reason) => f.write_str(reason.russian_message())?,
    }
    if error.stage == Stage::OutputLimit && error.cause != Cause::Problem(Problem::InvalidMaximum) {
        f.write_str(concat!(
            " Проверьте сервис или укажите max_tokens в дополнительных параметрах провайдера, ",
            "затем повторите попытку.",
        ))?;
    }
    Ok(())
}

/// Russian text of `error`, for callers and tests that need an owned message.
pub(in crate::local_proxy) fn message(error: &RequestError) -> String {
    let mut text = String::new();
    // Writing into a String cannot fail.
    let _ = fmt(error, &mut text);
    text
}

/// Russian counterpart of `catalog_message` for both catalog sources.
pub(super) fn catalog(official: &RequestError, admin: &RequestError) -> String {
    format!(
        "Официальный список моделей: {} Резервный список моделей: {}",
        message(official),
        message(admin)
    )
}

fn stage_text(stage: Stage) -> &'static str {
    match stage {
        Stage::Request => "прочитать запрос",
        Stage::Lite => "обработать запрос Responses Lite",
        Stage::Chat => "обработать ответ Chat",
        Stage::Anthropic => "обработать ответ Anthropic",
        Stage::Gemini => "обработать ответ Gemini",
        Stage::Responses => "обработать ответ Responses",
        Stage::Read => "прочитать ответ сервиса",
        Stage::Catalog => "получить список моделей",
        Stage::OutputLimit => "узнать максимальную длину ответа модели",
    }
}

pub(in crate::local_proxy) fn problem_text(problem: Problem) -> &'static str {
    match problem {
        Problem::ObjectRequired => "Тело запроса должно быть объектом JSON.",
        Problem::ReasoningObject => "Поле reasoning должно быть объектом JSON или null.",
        Problem::UnsupportedEncoding => {
            "Этот формат сжатия запроса не поддерживается. Поддерживаются identity, gzip и zstd."
        }
        Problem::GzipDecode => "Сжатые данные gzip повреждены или неполны.",
        Problem::ZstdDecode => "Сжатые данные zstd повреждены или неполны.",
        Problem::Encode => "Не удалось закодировать преобразованное содержимое в формат ответа.",
        Problem::Framing => concat!(
            "Сервис вернул данные, которые не распознаны как JSON или SSE. ",
            "Проверьте тип API провайдера.",
        ),
        Problem::MissingChoices => "В ответе JSON сервиса нет choices[0].message.",
        Problem::MissingTerminal => {
            "Сервис завершил передачу, но не отправил событие завершения ответа."
        }
        Problem::MissingEventType => "У события нет поля type, и имя события SSE не указано.",
        Problem::EventTypeMismatch => "Имя события SSE не совпадает с полем type в JSON.",
        Problem::InvalidEvent => concat!(
            "Поля или порядок событий не соответствуют формату выбранного API. ",
            "Проверьте тип API провайдера.",
        ),
        Problem::MissingBlockIndex => {
            "У события содержимого нет корректного неотрицательного целого index."
        }
        Problem::BlockOrder => "Блок содержимого ещё не начат, уже завершён или создан повторно.",
        Problem::UnknownBlock => "Сервис вернул неподдерживаемый тип блока содержимого.",
        Problem::BlockDelta => "Тип фрагмента содержимого не соответствует его блоку.",
        Problem::DeltaText => "У фрагмента содержимого нет корректной текстовой строки.",
        Problem::ToolArguments => {
            "Аргументы вызова инструмента должны быть корректным объектом JSON."
        }
        Problem::MissingStopReason => {
            "Сервис не передал корректную причину завершения или событие начала сообщения."
        }
        Problem::UnclosedBlock => "Сообщение завершено, но некоторые блоки содержимого не закрыты.",
        Problem::MissingContent => {
            "В сообщении сервиса нет массива content или корректного типа сообщения."
        }
        Problem::InvalidTool => {
            "В вызове инструмента нет имени, идентификатора или корректного объекта аргументов."
        }
        Problem::UnsupportedResponseContent => concat!(
            "Сервис вернул изображение, файл или блок содержимого, ",
            "который текущий API не может преобразовать.",
        ),
        Problem::Incomplete => "Сервис явно отметил ответ как незавершённый.",
        Problem::ContentFilter => "Сервис остановил генерацию из-за модерации содержимого.",
        Problem::InvalidModel => "В запросе нет корректного поля model. Сначала выберите модель.",
        Problem::ModelEndpoint => {
            "Не удалось определить адрес API со сведениями о модели по текущему адресу сервиса."
        }
        Problem::MissingMaximum => {
            "В сведениях о модели от сервиса нет корректного положительного целого max_tokens."
        }
        Problem::InvalidMaximum => concat!(
            "Длина ответа должна быть положительным целым числом. ",
            "Проверьте max_tokens в запросе или в настройках провайдера.",
        ),
        Problem::Prepare => concat!(
            "Не удалось создать запрос к сервису. ",
            "Проверьте адрес сервиса и дополнительные заголовки.",
        ),
        Problem::CatalogSettings => "Не удалось прочитать настройки сервиса списка моделей.",
        Problem::CatalogAddress => "Некорректный адрес сервиса списка моделей.",
        Problem::CatalogInvalid => {
            "В списке моделей нет корректного массива models, названий моделей или видимых моделей."
        }
        Problem::MissingItem => "В событии вывода нет объекта item.",
        Problem::MissingItemId => "У выводимого содержимого нет корректного id.",
        Problem::MissingResponse => "В событии завершения нет объекта response.",
        Problem::ResponseStatus => "Событие завершения не соответствует response.status.",
        Problem::ContentMismatch => {
            "Итоговое содержимое не совпадает с ранее отправленными фрагментами."
        }
    }
}

fn json_text(kind: JsonKind) -> &'static str {
    match kind {
        JsonKind::Syntax => "Некорректный синтаксис JSON",
        JsonKind::Eof => "Данные JSON неполны",
        JsonKind::Data => "Типы полей JSON не соответствуют требованиям",
    }
}

fn read_text(kind: ReadFailure) -> &'static str {
    match kind {
        ReadFailure::Timeout => {
            "Истекло время ожидания следующих данных: пауза без данных достигла заданного предела."
        }
        ReadFailure::Deadline => "Истекло время ожидания сведений о модели.",
        ReadFailure::Reset => "Соединение сброшено.",
        ReadFailure::Closed => "Соединение закрыто.",
        ReadFailure::Eof => {
            "Соединение завершилось раньше времени, тело ответа получено не полностью."
        }
        ReadFailure::InvalidData => {
            "Некорректная кодировка передаваемых данных, или тело ответа повреждено."
        }
        ReadFailure::Other => "При чтении тела ответа произошла сетевая ошибка.",
    }
}

/// Mirrors `upstream::http_reason`; the text follows "Сервис вернул HTTP {status}: ".
fn http_reason(status: u16) -> &'static str {
    match status {
        400 | 422 => "параметры запроса не приняты",
        401 => "аутентификация не пройдена. Проверьте ключ или вход в аккаунт",
        403 => "у текущего аккаунта нет доступа",
        404 => "модель или адрес API не найдены",
        408 | 504 => "истекло время обработки запроса",
        413 => "запрос слишком большой",
        429 => "сработало ограничение частоты запросов или лимит",
        500 => "внутренняя ошибка сервиса",
        502 => "шлюз сервиса не смог выполнить запрос",
        503 | 529 => "сервис перегружен или временно недоступен",
        300..=399 => "адрес API перенаправляет запрос. Проверьте адрес и настройки перенаправлений",
        _ => "запрос не выполнен",
    }
}

fn upstream_text(reason: Failure) -> &'static str {
    match reason {
        Failure::Authentication => {
            "Сервис отклонил аутентификацию. Проверьте ключ API или войдите в аккаунт снова."
        }
        Failure::Permission => "У текущего аккаунта нет доступа к этому API или модели.",
        Failure::RateLimit => concat!(
            "Достигнут предел частоты или числа параллельных запросов к сервису. ",
            "Повторите попытку позже.",
        ),
        Failure::Quota => "Лимит сервиса недостаточен или исчерпан. Проверьте баланс и лимиты.",
        Failure::Model => concat!(
            "Сервис не нашёл запрошенную модель или адрес API. ",
            "Проверьте название модели и адрес сервиса.",
        ),
        Failure::Context => {
            "Запрос превышает размер контекста модели. Сократите чат или уберите часть вложений."
        }
        Failure::TooLarge => {
            "Сервис отклонил слишком большой запрос. Сократите содержимое запроса."
        }
        Failure::InvalidRequest => concat!(
            "Сервис отклонил параметры запроса. ",
            "Проверьте, какие параметры и форматы содержимого поддерживает модель.",
        ),
        Failure::Overloaded => {
            "Сервис перегружен или временно недоступен. Повторите попытку позже."
        }
        Failure::Timeout => "Истекло время обработки запроса сервисом. Повторите попытку позже.",
        Failure::Internal => "Внутренняя ошибка сервиса. Повторите попытку позже.",
        Failure::ContentFilter => "Сервис остановил генерацию из-за модерации содержимого.",
        Failure::ToolArguments => {
            "Сервис сгенерировал аргументы вызова инструмента в некорректном формате."
        }
        Failure::Cancelled => "Сервис отменил этот ответ.",
        Failure::Unknown => "Сервис отправил событие ошибки без распознаваемого кода ошибки.",
    }
}
