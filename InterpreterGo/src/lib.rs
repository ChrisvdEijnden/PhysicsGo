use pest::Parser;
use pest_derive::Parser;
use serde::Serialize;
use wasm_bindgen::prelude::*;

pub mod indent;
pub mod interpreter;

use indent::{indent_to_braces, SourcePos};
use interpreter::{run_simulation, Block, Env};
pub use interpreter::DataSeries;

#[derive(Parser)]
#[grammar = "grammar.pest"]
pub struct PhysicsGoParser;

#[derive(Serialize, Debug)]
pub struct RunError {
    /// 1-based line and column in the block's own source
    pub line: usize,
    pub column: usize,
    pub message: String,
    pub block: &'static str,
}

#[derive(Serialize)]
pub struct RunResult {
    pub ok: bool,
    pub history: Vec<Env>,
    pub errors: Vec<RunError>,
}

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn run(start_src: &str, model_src: &str, max_steps: usize) -> JsValue {
    serde_wasm_bindgen::to_value(&run_source(start_src, model_src, max_steps)).unwrap()
}

/// Like `run`, with measured data series (`[{ name, t: [...], values: [...] }]`)
/// that the code can read as variables at the current t
#[wasm_bindgen]
pub fn run_with_data(start_src: &str, model_src: &str, max_steps: usize, data: JsValue) -> JsValue {
    let result = match serde_wasm_bindgen::from_value::<Vec<DataSeries>>(data) {
        Ok(data) => run_source_with_data(start_src, model_src, max_steps, &data),
        Err(e) => failed(RunError { line: 1, column: 1, message: format!("invalid measured data: {e}"), block: "start" }),
    };
    serde_wasm_bindgen::to_value(&result).unwrap()
}

fn failed(error: RunError) -> RunResult {
    RunResult { ok: false, history: vec![], errors: vec![error] }
}

pub fn run_source(start_src: &str, model_src: &str, max_steps: usize) -> RunResult {
    run_source_with_data(start_src, model_src, max_steps, &[])
}

pub fn run_source_with_data(start_src: &str, model_src: &str, max_steps: usize, data: &[DataSeries]) -> RunResult {
    let start = match indent_to_braces(start_src) {
        Ok(result) => result,
        Err(e) => return failed(RunError { line: e.line, column: 1, message: e.message, block: "start" }),
    };
    let model = match indent_to_braces(model_src) {
        Ok(result) => result,
        Err(e) => return failed(RunError { line: e.line, column: 1, message: e.message, block: "model" }),
    };

    let start_pairs = match PhysicsGoParser::parse(Rule::program, &start.braced) {
        Ok(mut p) => p.next().unwrap().into_inner(),
        Err(e) => return failed(map_pest_error(e, &start.line_map, "start")),
    };
    let model_pairs = match PhysicsGoParser::parse(Rule::program, &model.braced) {
        Ok(mut p) => p.next().unwrap().into_inner(),
        Err(e) => return failed(map_pest_error(e, &model.line_map, "model")),
    };

    let start_block = Block { name: "start", line_map: &start.line_map };
    let model_block = Block { name: "model", line_map: &model.line_map };
    let (history, error) = run_simulation(start_pairs, model_pairs, max_steps, data, &start_block, &model_block);
    RunResult { ok: error.is_none(), history, errors: error.into_iter().collect() }
}

// Grammar rule names, in words a student understands
fn describe_rule(rule: &Rule) -> String {
    match rule {
        Rule::expr | Rule::term | Rule::unary | Rule::power | Rule::atom => "a value or calculation",
        Rule::number => "a number",
        Rule::identifier => "a variable name",
        Rule::function_call => "a function",
        Rule::assign_op => "'=' (or '+=', '-=', '*=', '/=')",
        Rule::comparison_op => "a comparison (<, >, <=, >=, ==, !=)",
        Rule::statement | Rule::assignment => "a line like 'x = 5'",
        Rule::if_stmt => "'als ...:'",
        Rule::stop_stmt => "'stop als ...'",
        Rule::if_kw => "'als'",
        Rule::stop_kw => "'stop'",
        Rule::condition => "a condition such as 'x <= 0'",
        Rule::add | Rule::sub | Rule::mul | Rule::div | Rule::pow_op => "an operator (+, -, *, /, ^)",
        Rule::sub_op => "'-'",
        Rule::EOI => "the end of the line",
        Rule::program | Rule::WHITESPACE | Rule::COMMENT | Rule::keyword | Rule::ident_char => "something else",
    }
    .into()
}

fn map_pest_error(err: pest::error::Error<Rule>, line_map: &[SourcePos], block: &'static str) -> RunError {
    let (braced_line, column) = match err.line_col {
        pest::error::LineColLocation::Pos((l, c)) => (l, c),
        pest::error::LineColLocation::Span((l, c), _) => (l, c),
    };
    let message = err.renamed_rules(describe_rule).variant.message().into_owned();
    match line_map.get(braced_line.saturating_sub(1)) {
        Some(pos) => RunError { line: pos.line, column: column + pos.indent, message, block },
        // Past the last line: point just after the block's final line
        None => RunError { line: line_map.last().map_or(1, |p| p.line), column: 1, message, block },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn final_state(start: &str, model: &str, steps: usize) -> Env {
        let result = run_source(start, model, steps);
        assert!(result.ok, "unexpected errors: {:?}", result.errors);
        result.history.last().unwrap().clone()
    }

    fn error_of(start: &str, model: &str) -> RunError {
        let result = run_source(start, model, 10);
        assert!(!result.ok, "expected an error");
        result.errors.into_iter().next().unwrap()
    }

    #[test]
    fn comments_on_their_own_and_after_code() {
        let state = final_state("// Initialiseer Parameters\nt = 0\ndt = 0.01 // in seconds\n", "", 0);
        assert_eq!(state["dt"], 0.01);
    }

    #[test]
    fn compound_assignment() {
        let state = final_state("x = 10\n", "x += 2\nx -= 1\nx *= 3\nx /= 11\nstop als x > 0", 5);
        assert_eq!(state["x"], 3.0);
    }

    #[test]
    fn freefall_advances_time_once_when_the_model_updates_t() {
        let start = "t = 0\ndt = 0.01\nh = 20\nv = 0\n";
        let model = "v = v - 9.81 * dt\nh = h + v * dt\nt += dt\n\nstop als h <= 0\n";
        let state = final_state(start, model, 100_000);
        // Falling 20 m takes about 2.02 s, not twice that
        assert!((state["t"] - 2.02).abs() < 0.02, "t = {}", state["t"]);
    }

    #[test]
    fn time_advances_automatically_when_the_model_leaves_t_alone() {
        // The step taken at t = 2 stops the run and records the state it computed, at t = 2.5
        let state = final_state("t = 0\ndt = 0.5\n", "stop als t >= 2", 100);
        assert_eq!(state["t"], 2.5);
    }

    #[test]
    fn scientific_notation_and_bare_decimals() {
        let state = final_state("g = 6.674e-11\nh = .5\nk = 2E3\n", "", 0);
        assert_eq!(state["g"], 6.674e-11);
        assert_eq!(state["h"], 0.5);
        assert_eq!(state["k"], 2000.0);
    }

    #[test]
    fn power_precedence() {
        let state = final_state("a = -2^2\nb = 2^3^2\nc = 2^-1\nd = 2 * -3\n", "", 0);
        assert_eq!(state["a"], -4.0);
        assert_eq!(state["b"], 512.0);
        assert_eq!(state["c"], 0.5);
        assert_eq!(state["d"], -6.0);
    }

    #[test]
    fn if_block_with_comment_after_colon() {
        let model = "x = x - 1\nals x <= 0:   // bounce\n    x = 5\n    y = 1\nstop als y == 1";
        let state = final_state("x = 1\ny = 0\n", model, 10);
        assert_eq!(state["x"], 5.0);
        assert_eq!(state["y"], 1.0);
    }

    #[test]
    fn nested_if_blocks() {
        let model = "als x > 0:\n    als x > 1:\n        y = 2\n    z = 3\nw = 4\nstop als w == 4";
        let state = final_state("x = 2\ny = 0\nz = 0\n", model, 5);
        assert_eq!((state["y"], state["z"], state["w"]), (2.0, 3.0, 4.0));
    }

    #[test]
    fn syntax_errors_point_at_the_users_line() {
        let e = error_of("t = 0\n\ndt = 0.01 // seconds\nh = 20 +\n", "");
        assert_eq!((e.block, e.line), ("start", 4));
        assert!(e.message.contains("value or calculation"), "{}", e.message);
    }

    #[test]
    fn syntax_error_column_includes_indentation() {
        let e = error_of("x = 1\n", "als x > 0:\n    y = = 2\nstop als x > 0");
        assert_eq!((e.line, e.column), (2, 9));
    }

    #[test]
    fn two_statements_on_one_line_are_rejected() {
        let e = error_of("x = 1 y = 2\n", "");
        assert_eq!(e.line, 1);
    }

    #[test]
    fn unknown_variable_is_an_error() {
        let e = error_of("v = 0\ndt = 0.1\n", "v = v - G * dt");
        assert_eq!((e.block, e.line, e.column), ("model", 1, 9));
        assert!(e.message.contains("'G'"), "{}", e.message);
    }

    #[test]
    fn unknown_function_is_an_error_not_a_panic() {
        let e = error_of("x = foo(2)\n", "");
        assert!(e.message.contains("unknown function 'foo'"), "{}", e.message);
    }

    #[test]
    fn indentation_errors() {
        assert!(error_of("x = 1\n  y = 2\n", "").message.contains("unexpected indentation"));
        assert!(error_of("x = 1\nals x > 0:\ny = 2\n", "").message.contains("expected an indented line"));
        assert!(error_of("x = 1\nals x > 0:\n", "").message.contains("expected an indented line"));
        let e = error_of("x = 1\nals x > 0:\n    y = 2\n  z = 3\n", "");
        assert_eq!(e.line, 4);
    }

    fn series(name: &str, t: &[f64], values: &[f64]) -> DataSeries {
        DataSeries { name: name.into(), t: t.to_vec(), values: values.to_vec() }
    }

    #[test]
    fn measured_data_is_interpolated_at_t() {
        let data = [series("y_video1", &[0.0, 1.0, 2.0], &[10.0, 20.0, 40.0])];
        let result = run_source_with_data("t = 0\ndt = 0.5\n", "verschil = y_video1 - 10\nstop als t >= 1.5", 10, &data);
        assert!(result.ok, "{:?}", result.errors);
        let ys: Vec<f64> = result.history.iter().map(|s| s["y_video1"]).collect();
        assert_eq!(ys, [10.0, 15.0, 20.0, 30.0, 40.0]);
        // The model reads the value at the start of its step
        assert_eq!(result.history[2]["verschil"], 5.0);
    }

    #[test]
    fn measured_data_is_nan_outside_its_range() {
        let s = series("x", &[1.0, 2.0], &[5.0, 6.0]);
        assert!(s.at(0.5).is_nan());
        assert!(s.at(2.5).is_nan());
        assert!(s.at(f64::NAN).is_nan());
        assert_eq!(s.at(1.0), 5.0);
        assert_eq!(s.at(2.0), 6.0);
        assert!(series("x", &[], &[]).at(0.0).is_nan());
    }

    #[test]
    fn keywords_are_not_variable_names() {
        assert!(!run_source("als = 1\n", "", 0).ok);
        // ...but names that merely start with one are fine
        assert_eq!(final_state("alsof = 1\nstoptijd = 2\n", "", 0)["stoptijd"], 2.0);
    }
}
