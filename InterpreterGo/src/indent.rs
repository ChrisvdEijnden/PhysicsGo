pub fn indent_to_braces(source: &str) -> String {
    let mut output = String::new();
    let mut indent_stack = vec![0usize];
    let mut expect_new_indent = false;

    for raw_line in source.lines() {
        let trimmed = raw_line.trim_end();
        if trimmed.trim().is_empty() {
            continue;
        }

        let indent = trimmed.len() - trimmed.trim_start().len();
        let content = trimmed.trim_start();

        if expect_new_indent {
            indent_stack.push(indent);
            expect_new_indent = false;
        } else {
            while indent < *indent_stack.last().unwrap() {
                indent_stack.pop();
                output.push_str("}\n");
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
    }

    while indent_stack.len() > 1 {
        indent_stack.pop();
        output.push_str("}\n");
    }

    output
}