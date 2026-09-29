/// Source position of a line in the braced output, so errors can point at the user's code
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SourcePos {
    /// 1-based line number in the original source
    pub line: usize,
    /// How many characters of indentation were removed from the start of that line
    pub indent: usize,
}

pub struct IndentResult {
    pub braced: String,
    /// One entry per line of `braced`
    pub line_map: Vec<SourcePos>,
}

pub struct IndentError {
    pub line: usize,
    pub message: String,
}

/// Everything before `//`; the language has no strings, so `//` always starts a comment
fn strip_comment(line: &str) -> &str {
    match line.find("//") {
        Some(at) => &line[..at],
        None => line,
    }
}

/// Turns Python-style indentation into braces:
///
/// ```text
/// als x <= 0:          als x <= 0: {
///     v = -v     =>        v = -v
/// y = 1                }
///                      y = 1
/// ```
///
/// Comments and blank lines are dropped, so they can't affect indentation.
pub fn indent_to_braces(source: &str) -> Result<IndentResult, IndentError> {
    let mut output = String::new();
    let mut line_map = Vec::new();
    let mut indent_stack = vec![0usize];
    // Line number of an `als ...:` whose block hasn't started yet
    let mut open_block: Option<usize> = None;
    let mut last_real_line = 1usize;

    for (idx, raw_line) in source.lines().enumerate() {
        let line_no = idx + 1;
        let code = strip_comment(raw_line).trim_end();
        if code.trim().is_empty() {
            continue;
        }
        last_real_line = line_no;

        let content = code.trim_start();
        let indent = code.len() - content.len();
        let current = *indent_stack.last().unwrap();

        if open_block.take().is_some() {
            if indent <= current {
                return Err(IndentError {
                    line: line_no,
                    message: "expected an indented line after the line ending in ':'".into(),
                });
            }
            indent_stack.push(indent);
        } else if indent > current {
            return Err(IndentError {
                line: line_no,
                message: "unexpected indentation; only lines after `als ...:` are indented".into(),
            });
        } else {
            while indent < *indent_stack.last().unwrap() {
                indent_stack.pop();
                output.push_str("}\n");
                line_map.push(SourcePos { line: line_no, indent });
            }
            if indent != *indent_stack.last().unwrap() {
                return Err(IndentError {
                    line: line_no,
                    message: "this indentation doesn't match any line above it".into(),
                });
            }
        }

        if let Some(without_colon) = content.strip_suffix(':') {
            output.push_str(without_colon);
            output.push_str(": {\n");
            open_block = Some(line_no);
        } else {
            output.push_str(content);
            output.push('\n');
        }
        line_map.push(SourcePos { line: line_no, indent });
    }

    if let Some(line) = open_block {
        return Err(IndentError {
            line,
            message: "expected an indented line after the line ending in ':'".into(),
        });
    }

    while indent_stack.len() > 1 {
        indent_stack.pop();
        output.push_str("}\n");
        line_map.push(SourcePos { line: last_real_line, indent: 0 });
    }

    Ok(IndentResult { braced: output, line_map })
}
