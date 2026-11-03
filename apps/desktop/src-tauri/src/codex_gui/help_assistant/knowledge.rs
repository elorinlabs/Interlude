use super::catalog::DOCUMENTS;

const CHUNK_CHARS: usize = 1_800;
const MAX_EXCERPTS: usize = 8;
const MAX_PER_DOCUMENT: usize = 2;
const TOPIC_WEIGHT: usize = 4;

pub(super) struct Knowledge {
    pub(super) text: String,
    pub(super) sources: Vec<String>,
}

fn terms(query: &str) -> Vec<String> {
    let mut terms: Vec<String> = query
        .split(|character: char| !character.is_alphanumeric())
        .filter(|word| word.chars().count() > 1)
        .map(str::to_lowercase)
        .collect();
    let characters: Vec<_> = query.chars().collect();
    terms.extend(
        characters
            .windows(2)
            .filter(|pair| {
                pair.iter()
                    .all(|character| ('\u{4e00}'..='\u{9fff}').contains(character))
            })
            .map(|pair| pair.iter().collect()),
    );
    terms.sort();
    terms.dedup();
    terms
}

fn ranked_chunks(query: &str) -> Vec<(usize, usize, usize, String)> {
    let query = query.to_lowercase();
    let terms = terms(&query);
    let mut candidates = Vec::new();
    for (document_index, document) in DOCUMENTS.iter().enumerate() {
        let topic_score = document
            .keywords
            .iter()
            .filter(|keyword| query.contains(**keyword))
            .count()
            * TOPIC_WEIGHT;
        let characters: Vec<_> = document.text.chars().collect();
        for (index, chunk) in characters.chunks(CHUNK_CHARS).enumerate() {
            let text: String = chunk.iter().collect();
            let lower = text.to_lowercase();
            let score = topic_score
                + terms
                    .iter()
                    .filter(|term| lower.contains(term.as_str()))
                    .count();
            candidates.push((score, document_index, index, text));
        }
    }
    candidates
        .sort_by_key(|(score, document, chunk, _)| (std::cmp::Reverse(*score), *document, *chunk));
    candidates
}

pub(super) fn retrieve(query: &str) -> Knowledge {
    let mut counts = vec![0; DOCUMENTS.len()];
    let mut knowledge = Knowledge {
        text: String::new(),
        sources: Vec::new(),
    };
    for (_, document_index, chunk, text) in ranked_chunks(query) {
        if counts[document_index] >= MAX_PER_DOCUMENT {
            continue;
        }
        let path = DOCUMENTS[document_index].path;
        if counts[document_index] == 0 {
            knowledge.sources.push(path.to_owned());
        }
        counts[document_index] += 1;
        knowledge.text.push_str(&format!(
            "\n--- {path} (excerpt {}) ---\n{text}\n",
            chunk + 1
        ));
        if counts.iter().sum::<usize>() == MAX_EXCERPTS {
            break;
        }
    }
    knowledge
}
