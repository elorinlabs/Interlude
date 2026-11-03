use serde::Serialize;
use std::{collections::HashMap, io};

#[derive(Debug, thiserror::Error)]
pub(super) enum BlameError {
    #[error("Git blame I/O failed")]
    Io(#[from] io::Error),
    #[error("Git blame failed")]
    Git,
    #[error("Invalid blame output")]
    Invalid,
}

#[derive(Debug, Default, Serialize)]
pub(super) struct Annotations {
    pub(super) commits: Vec<Commit>,
    pub(super) ranges: Vec<LineRange>,
}

#[derive(Debug, Default, Serialize)]
pub(super) struct Commit {
    pub(super) hash: String,
    pub(super) author: String,
    pub(super) time: i64,
    pub(super) timezone: String,
    pub(super) summary: String,
}

#[derive(Debug, Serialize)]
pub(super) struct LineRange {
    pub(super) start: usize,
    pub(super) count: usize,
    pub(super) commit: Option<usize>,
}

pub(super) fn parse(
    lines: impl Iterator<Item = io::Result<String>>,
) -> Result<Annotations, BlameError> {
    let mut result = Annotations::default();
    let mut indexes = HashMap::new();
    let mut lines = lines;
    while let Some(header) = lines.next() {
        let (hash, start, count) = parse_header(&header?)?;
        let mut commit = Commit {
            hash: hash.clone(),
            ..Commit::default()
        };
        let mut complete = false;
        for line in lines.by_ref() {
            let line = line?;
            if line.starts_with("filename ") {
                complete = true;
                break;
            }
            parse_metadata(&mut commit, &line)?;
        }
        if !complete {
            return Err(BlameError::Invalid);
        }
        let index = if hash.bytes().all(|byte| byte == b'0') {
            None
        } else {
            Some(*indexes.entry(hash).or_insert_with(|| {
                result.commits.push(commit);
                result.commits.len() - 1
            }))
        };
        result.ranges.push(LineRange {
            start,
            count,
            commit: index,
        });
    }
    result.ranges.sort_unstable_by_key(|range| range.start);
    let mut next = 1;
    for range in &result.ranges {
        if range.start != next {
            return Err(BlameError::Invalid);
        }
        next = next.checked_add(range.count).ok_or(BlameError::Invalid)?;
    }
    Ok(result)
}

fn parse_header(header: &str) -> Result<(String, usize, usize), BlameError> {
    let fields: Vec<_> = header.split_whitespace().collect();
    if fields.len() != 4
        || ![40, 64].contains(&fields[0].len())
        || !fields[0].bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(BlameError::Invalid);
    }
    let start = fields[2]
        .parse::<usize>()
        .map_err(|_| BlameError::Invalid)?;
    let count = fields[3]
        .parse::<usize>()
        .map_err(|_| BlameError::Invalid)?;
    if start == 0 || count == 0 {
        return Err(BlameError::Invalid);
    }
    Ok((fields[0].to_owned(), start, count))
}

fn parse_metadata(commit: &mut Commit, line: &str) -> Result<(), BlameError> {
    if let Some(value) = line.strip_prefix("author ") {
        commit.author = value.to_owned();
    }
    if let Some(value) = line.strip_prefix("author-time ") {
        commit.time = value.parse().map_err(|_| BlameError::Invalid)?;
    }
    if let Some(value) = line.strip_prefix("author-tz ") {
        commit.timezone = value.to_owned();
    }
    if let Some(value) = line.strip_prefix("summary ") {
        commit.summary = value.to_owned();
    }
    Ok(())
}
