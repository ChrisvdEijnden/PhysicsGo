use pest::Parser;
use pest_derive::Parser;
use serde::Serialize;
use wasm_bindgen::prelude::*;

pub mod indent;
pub mod interpreter;

use indent::{indent_to_braces, IndentResult, SourcePos};
pub use interpreter::{DataSeries, RunError, Simulation, StopReason, CONSTANTS, FUNCTIONS, KEYWORDS};
use interpreter::{Block, Pos};

#[derive(Parser)]
#[grammar = "grammar.pest"]
pub struct PhysicsGoParser;

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

/// Parses and compiles both blocks and runs the start values. The model steps run with `Simulation::run`.
pub fn simulate(start_src: &str, model_src: &str, data: Vec<DataSeries>) -> Result<Simulation, RunError> {
    let start = braced(start_src, "start")?;
    let model = braced(model_src, "model")?;
    let start_pairs = parse(&start, "start")?;
    let model_pairs = parse(&model, "model")?;
    let start_block = Block { name: "start", line_map: &start.line_map };
    let model_block = Block { name: "model", line_map: &model.line_map };
    Simulation::new(start_pairs, model_pairs, &start_block, &model_block, data)
}

fn braced(source: &str, block: &'static str) -> Result<IndentResult, RunError> {
    indent_to_braces(source).map_err(|e| {
        RunError::new(Pos { block, line: e.line, column: 1 }, e.code, &[], e.message)
    })
}

fn parse<'a>(result: &'a IndentResult, block: &'static str) -> Result<pest::iterators::Pairs<'a, Rule>, RunError> {
    match PhysicsGoParser::parse(Rule::program, &result.braced) {
        Ok(mut pairs) => Ok(pairs.next().unwrap().into_inner()),
        Err(e) => Err(syntax_error(e, &result.line_map, block)),
    }
}

// What the parser expected next, as keys the app translates and in English
fn describe_rule(rule: &Rule) -> (&'static str, &'static str) {
    match rule {
        Rule::expr | Rule::term | Rule::unary | Rule::power | Rule::atom => ("value", "a value or calculation"),
        Rule::number => ("number", "a number"),
        Rule::identifier => ("variable", "a variable name"),
        Rule::function_call => ("function", "a function"),
        Rule::assign_op => ("assign", "'=' (or '+=', '-=', '*=', '/=')"),
        Rule::comparison_op => ("comparison", "a comparison (<, >, <=, >=, ==, !=)"),
        Rule::statement | Rule::assignment => ("statement", "a line like 'x = 5'"),
        Rule::if_stmt | Rule::if_kw => ("if", "'als ...:'"),
        Rule::else_part | Rule::else_kw => ("else", "'anders:'"),
        Rule::stop_stmt | Rule::stop_kw => ("stop", "'stop als ...'"),
        Rule::condition | Rule::or_cond | Rule::and_cond | Rule::not_cond | Rule::comparison => ("condition", "a condition such as 'x <= 0'"),
        Rule::and_kw | Rule::or_kw | Rule::not_kw => ("logic", "'en', 'of' or 'niet'"),
        Rule::add | Rule::sub | Rule::mul | Rule::div | Rule::pow_op => ("operator", "an operator (+, -, *, /, ^)"),
        Rule::sub_op => ("minus", "'-'"),
        Rule::block => ("block", "an indented line"),
        Rule::EOI => ("end", "the end of the line"),
        Rule::program | Rule::WHITESPACE | Rule::COMMENT | Rule::keyword | Rule::ident_char => ("other", "something else"),
    }
}

fn syntax_error(err: pest::error::Error<Rule>, line_map: &[SourcePos], block: &'static str) -> RunError {
    let (braced_line, column) = match err.line_col {
        pest::error::LineColLocation::Pos((l, c)) => (l, c),
        pest::error::LineColLocation::Span((l, c), _) => (l, c),
    };
    let mut expected: Vec<&str> = Vec::new();
    if let pest::error::ErrorVariant::ParsingError { positives, .. } = &err.variant {
        for rule in positives {
            let key = describe_rule(rule).0;
            if !expected.contains(&key) {
                expected.push(key);
            }
        }
    }
    let message = err.renamed_rules(|r| describe_rule(r).1.to_string()).variant.message().into_owned();
    let pos = match line_map.get(braced_line.saturating_sub(1)) {
        Some(p) => Pos { block, line: p.line, column: column + p.indent },
        // Past the last line: point just after the block's final line
        None => Pos { block, line: line_map.last().map_or(1, |p| p.line), column: 1 },
    };
    RunError::new(pos, "syntax", &[("expected", expected.join(","))], message)
}

/// A model running in the browser, a chunk of steps at a time
#[wasm_bindgen(js_name = Simulation)]
pub struct WasmSimulation {
    inner: Simulation,
    max_steps: usize,
}

#[wasm_bindgen(js_class = Simulation)]
impl WasmSimulation {
    /// Compiles the code and runs the start values; throws the first error in the code.
    /// `data` is measured data: `[{ name, t: [...], values: [...] }]`.
    #[wasm_bindgen(constructor)]
    pub fn new(start_src: &str, model_src: &str, max_steps: usize, data: JsValue) -> Result<WasmSimulation, JsValue> {
        let data: Vec<DataSeries> = serde_wasm_bindgen::from_value(data).map_err(|e| {
            to_js(&RunError::new(Pos { block: "start", line: 1, column: 1 }, "bad_data", &[], format!("invalid measured data: {e}")))
        })?;
        simulate(start_src, model_src, data)
            .map(|inner| WasmSimulation { inner, max_steps })
            .map_err(|e| to_js(&e))
    }

    /// Runs up to `count` more steps; true when the run is finished
    pub fn run(&mut self, count: usize) -> bool {
        self.inner.run(self.max_steps, count)
    }

    pub fn steps(&self) -> usize {
        self.inner.steps
    }

    /// `{ names, columns: Float64Array[], steps, stopReason, error, warning }`; a column holds a
    /// variable's value after the start values and after every step (NaN while it has none)
    pub fn result(&self) -> JsValue {
        let columns = js_sys::Array::new();
        for column in &self.inner.columns {
            columns.push(&js_sys::Float64Array::from(column.as_slice()));
        }
        let out = js_sys::Object::new();
        let set = |key: &str, value: &JsValue| {
            js_sys::Reflect::set(&out, &key.into(), value).unwrap();
        };
        set("names", &serde_wasm_bindgen::to_value(&self.inner.recorded_names()).unwrap());
        set("columns", &columns);
        set("steps", &JsValue::from(self.inner.steps as u32));
        set("stopReason", &serde_wasm_bindgen::to_value(&self.inner.finished).unwrap());
        set("error", &self.inner.error.as_ref().map_or(JsValue::NULL, to_js));
        set("warning", &self.inner.warning.as_ref().map_or(JsValue::NULL, to_js));
        out.into()
    }
}

fn to_js(error: &RunError) -> JsValue {
    serde_wasm_bindgen::to_value(error).unwrap()
}

#[derive(Serialize)]
struct Builtin {
    name: &'static str,
    #[serde(rename = "minArgs")]
    min_args: usize,
    #[serde(rename = "maxArgs")]
    max_args: Option<usize>,
}

/// The language's functions, keywords and constants: the one list the editor highlights and suggests
#[wasm_bindgen]
pub fn builtins() -> JsValue {
    #[derive(Serialize)]
    struct Builtins {
        functions: Vec<Builtin>,
        keywords: &'static [&'static str],
        constants: Vec<&'static str>,
    }
    serde_wasm_bindgen::to_value(&Builtins {
        functions: FUNCTIONS.iter().map(|&(name, _, min, max)| Builtin { name, min_args: min, max_args: max }).collect(),
        keywords: KEYWORDS,
        constants: CONSTANTS.iter().map(|(name, _)| *name).collect(),
    })
    .unwrap()
}

/// Runs a whole model at once (the command line and tests)
pub fn run_source(start_src: &str, model_src: &str, max_steps: usize) -> Result<Simulation, RunError> {
    run_source_with_data(start_src, model_src, max_steps, vec![])
}

pub fn run_source_with_data(start_src: &str, model_src: &str, max_steps: usize, data: Vec<DataSeries>) -> Result<Simulation, RunError> {
    let mut sim = simulate(start_src, model_src, data)?;
    sim.run(max_steps, max_steps + 1);
    match sim.error.clone() {
        Some(e) => Err(e),
        None => Ok(sim),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn final_state(start: &str, model: &str, steps: usize) -> HashMap<String, f64> {
        match run_source(start, model, steps) {
            Ok(sim) => sim.final_state(),
            Err(e) => panic!("unexpected error: {e:?}"),
        }
    }

    fn error_of(start: &str, model: &str) -> RunError {
        run_source(start, model, 10).err().expect("expected an error")
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
    fn blank_lines_inside_a_block_are_just_blank_lines() {
        // Start values and model rules come from separate editors, so spacing never moves a line between them
        let state = final_state("t = 0\n\ndt = 0.5\n\nx = 0\n", "x = x + 1\n\nstop als t >= 1", 10);
        assert_eq!(state["x"], 3.0);
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
    fn anders_and_anders_als() {
        let model = "als x < 0:\n    s = -1\nanders als x == 0:\n    s = 0\nanders:\n    s = 1\nstop als t >= 0";
        let sign = |x: &str| final_state(&format!("t = 0\ndt = 1\nx = {x}\n"), model, 5)["s"];
        assert_eq!((sign("-3"), sign("0"), sign("7")), (-1.0, 0.0, 1.0));
    }

    #[test]
    fn english_keywords_work_too() {
        let model = "if x > 1 and not x > 5:\n    y = 1\nelse:\n    y = 2\nstop if y == 1 or y == 2";
        assert_eq!(final_state("x = 3\n", model, 5)["y"], 1.0);
        assert_eq!(final_state("x = 9\n", model, 5)["y"], 2.0);
    }

    #[test]
    fn logic_precedence_and_parentheses() {
        // niet before en before of: a of b en c is a of (b en c)
        let state = final_state("a = 1\nb = 0\n", "als a == 1 of b == 1 en b == 2:\n    y = 1\nals (a == 1 of b == 1) en b == 2:\n    z = 1\nstop als a == 1", 3);
        assert_eq!(state.get("y"), Some(&1.0));
        // z is recorded (the code assigns it) but never got a value
        assert!(state["z"].is_nan());
    }

    #[test]
    fn constants_and_multi_argument_functions() {
        let state = final_state("a = pi\nb = e\nc = atan2(1, 1)\nd = min(3, 1, 2)\nf = max(3, 1, 2)\ng = round(2.345, 2)\nh = pow(2, 10)\nk = sign(-4)\n", "", 0);
        assert_eq!(state["a"], std::f64::consts::PI);
        assert_eq!(state["b"], std::f64::consts::E);
        assert!((state["c"] - std::f64::consts::FRAC_PI_4).abs() < 1e-12);
        assert_eq!((state["d"], state["f"], state["g"], state["h"], state["k"]), (1.0, 3.0, 2.35, 1024.0, -1.0));
    }

    #[test]
    fn constants_can_be_given_another_value_and_are_not_recorded_otherwise() {
        let state = final_state("e = 1.6e-19\n", "", 0);
        assert_eq!(state["e"], 1.6e-19);
        assert!(!final_state("x = pi\n", "", 0).contains_key("pi"));
    }

    #[test]
    fn syntax_errors_point_at_the_users_line() {
        let e = error_of("t = 0\n\ndt = 0.01 // seconds\nh = 20 +\n", "");
        assert_eq!((e.block, e.line, e.code), ("start", 4, "syntax"));
        assert!(e.message.contains("value or calculation"), "{}", e.message);
        assert!(e.params["expected"].split(',').any(|k| k == "value"), "{:?}", e.params);
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
        assert_eq!((e.block, e.line, e.column, e.code), ("model", 1, 9, "undefined_variable"));
        assert_eq!(e.params["name"], "G");
    }

    #[test]
    fn unknown_function_is_an_error_not_a_panic() {
        let e = error_of("x = foo(2)\n", "");
        assert_eq!((e.code, e.params["name"].as_str()), ("unknown_function", "foo"));
        assert!(e.message.contains("unknown function 'foo'"), "{}", e.message);
    }

    #[test]
    fn wrong_number_of_arguments() {
        let e = error_of("x = sin(1, 2)\n", "");
        assert_eq!((e.code, e.params["expected"].as_str(), e.params["given"].as_str()), ("wrong_arguments", "1", "2"));
    }

    #[test]
    fn indentation_errors() {
        assert_eq!(error_of("x = 1\n  y = 2\n", "").code, "indent_unexpected");
        assert_eq!(error_of("x = 1\nals x > 0:\ny = 2\n", "").code, "indent_expected");
        assert_eq!(error_of("x = 1\nals x > 0:\n", "").code, "indent_expected");
        let e = error_of("x = 1\nals x > 0:\n    y = 2\n  z = 3\n", "");
        assert_eq!((e.line, e.code), (4, "indent_mismatch"));
    }

    #[test]
    fn stop_reason_and_step_count() {
        let sim = run_source("t = 0\ndt = 1\n", "stop als t >= 3", 100).unwrap();
        assert_eq!((sim.finished, sim.steps), (Some(StopReason::Condition), 4));
        let sim = run_source("t = 0\ndt = 1\n", "x = t", 50).unwrap();
        assert_eq!((sim.finished, sim.steps), (Some(StopReason::Limit), 50));
    }

    #[test]
    fn runs_in_chunks_like_in_one_go() {
        let mut sim = simulate("t = 0\ndt = 0.01\nv = 0\n", "v = v + 9.81 * dt\nstop als t >= 5", vec![]).unwrap();
        let mut calls = 0;
        while !sim.run(100_000, 37) {
            calls += 1;
        }
        let whole = run_source("t = 0\ndt = 0.01\nv = 0\n", "v = v + 9.81 * dt\nstop als t >= 5", 100_000).unwrap();
        assert!(calls > 10);
        assert_eq!(sim.final_state(), whole.final_state());
        assert_eq!(sim.columns, whole.columns);
    }

    #[test]
    fn the_first_nan_or_infinity_is_reported() {
        let sim = run_source("t = 0\ndt = 1\nx = 2\n", "x = x - 1\ny = 1 / x\nz = sqrt(x)\nstop als t >= 4", 10).unwrap();
        let w = sim.warning.expect("expected a warning");
        assert_eq!((w.code, w.params["name"].as_str(), w.params["value"].as_str(), w.line), ("not_finite", "y", "Infinity", 2));
    }

    #[test]
    fn columns_hold_every_step() {
        let sim = run_source("t = 0\ndt = 1\nx = 0\n", "x = x + 2\nstop als t >= 2", 10).unwrap();
        let names = sim.recorded_names();
        let x = &sim.columns[names.iter().position(|n| n == "x").unwrap()];
        assert_eq!(x, &vec![0.0, 2.0, 4.0, 6.0]);
    }

    fn series(name: &str, t: &[f64], values: &[f64]) -> DataSeries {
        DataSeries { name: name.into(), t: t.to_vec(), values: values.to_vec() }
    }

    #[test]
    fn measured_data_is_interpolated_at_t() {
        let data = vec![series("y_video1", &[0.0, 1.0, 2.0], &[10.0, 20.0, 40.0])];
        let sim = run_source_with_data("t = 0\ndt = 0.5\n", "verschil = y_video1 - 10\nstop als t >= 1.5", 10, data).unwrap();
        let names = sim.recorded_names();
        let col = |n: &str| sim.columns[names.iter().position(|x| x == n).unwrap()].clone();
        assert_eq!(col("y_video1"), vec![10.0, 15.0, 20.0, 30.0, 40.0]);
        // The model reads the value at the start of its step
        assert_eq!(col("verschil")[2], 5.0);
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
        assert!(run_source("als = 1\n", "", 0).is_err());
        assert!(run_source("en = 1\n", "", 0).is_err());
        // ...but names that merely start with one are fine
        assert_eq!(final_state("alsof = 1\nstoptijd = 2\nenergie = 3\n", "", 0)["stoptijd"], 2.0);
    }
}
