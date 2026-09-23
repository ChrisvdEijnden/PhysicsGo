pub struct IndentResult {
    pub braced: String,
    pub line_map: Vec<usize>,
}

pub fn indent_to_braces(source: &str) -> IndentResult {
    let mut output = String::new();
    let mut line_map = Vec::new();
    let mut indent_stack = vec![0usize];
    let mut expect_new_indent = false;
    let mut last_real_line = 1usize;

    for (idx, raw_line) in source.lines().enumerate() {
        let original_line_no = idx + 1;
        let trimmed = raw_line.trim_end();
        if trimmed.trim().is_empty() {
            continue;
        }
        last_real_line = original_line_no;

        let indent = trimmed.len() - trimmed.trim_start().len();
        let content = trimmed.trim_start();

        if expect_new_indent {
            indent_stack.push(indent);
            expect_new_indent = false;
        } else {
            while indent < *indent_stack.last().unwrap() {
                indent_stack.pop();
                output.push_str("}\n");
                line_map.push(original_line_no);
            }
        }

        if let Some(without_colon) = content.strip_suffix(':') {
            output.push_str(without_colon);
            output.push_str(": {\n");
            expect_new_indent = true;
        } else {
            output.push_str(content);
            output.push('\n');
        }
        line_map.push(original_line_no);
    }

    while indent_stack.len() > 1 {
        indent_stack.pop();
        output.push_str("}\n");
        line_map.push(last_real_line);
    }

    IndentResult { braced: output, line_map }
}