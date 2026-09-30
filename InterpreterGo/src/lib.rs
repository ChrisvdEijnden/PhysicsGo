use pest::Parser;
use pest_derive::Parser;
use serde::Serialize;
use std::collections::BTreeMap;
use wasm_bindgen::prelude::*;

pub mod compile;
pub mod indent;
pub mod interpreter;

use compile::{collect_assigned, compile_block, Block, Pos, Slots, CONSTANTS, FUNCTIONS, KEYWORDS};
use indent::{indent_to_braces, SourcePos};
use interpreter::{Machine, StepResult};
pub use interpreter::DataSeries;

#[derive(Parser)]
#[grammar = "grammar.pest"]
pub struct PhysicsGoParser;

#[derive(Serialize, Debug, Clone)]
pub struct RunError {
    /// 1-based line and column in the block's own source
    pub line: usize,
    pub column: usize,
    pub block: &'static str,
    /// What went wrong as a code the app translates (src/lib/interpreterErrors.ts), with its details
    pub code: &'static str,
    pub params: BTreeMap<&'static str, String>,
    /// The same in English, for the command line and tests
    pub message: String,
}

pub fn error(pos: Pos, code: &'static str, params: &[(&'static str, String)], message: String) -> RunError {
    RunError {
        line: pos.line,
        column: pos.column,
        block: pos.block,
        code,
        params: params.iter().cloned().collect(),
        message,
    }
}

/// The first variable (in code order) that got a value that isn't a number (NaN) or is infinite,
/// and the recorded step where that happened. Measured data doesn't count: it has no value outside
/// the measured times on purpose.
#[derive(Serialize, Debug, Clone)]
pub struct NonFinite {
    pub name: String,
    pub step: usize,
}

/// A run: one column of values per variable (a row per recorded step: after the start values, then
/// after every step), whether a stop condition ended it, and what went wrong if it didn't finish
pub struct RunResult {
    pub ok: bool,
    pub names: Vec<String>,
    pub columns: Vec<Vec<f64>>,
    pub errors: Vec<RunError>,
    pub stopped: bool,
    pub first_non_finite: Option<NonFinite>,
}

impl RunResult {
    /// Recorded steps, including the state after the start values
    pub fn rows(&self) -> usize {
        self.columns.first().map_or(0, Vec::len)
    }

    pub fn column(&self, name: &str) -> Option<&[f64]> {
        self.names.iter().position(|n| n == name).map(|i| self.columns[i].as_slice())
    }
}

fn failed(error: RunError) -> RunResult {
    RunResult { ok: false, names: vec![], columns: vec![], errors: vec![error], stopped: false, first_non_finite: None }
}

// The app shows progress this often during a long run
const PROGRESS_EVERY: usize = 20_000;

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

/// Runs a model. `data` is the measured series (`[{ name, t: [...], values: [...] }]`) the code can
/// read at the current t; `on_progress` is called with the number of steps done every so often.
/// Returns `{ ok, stopped, errors, names, columns: Float64Array[], firstNonFinite }`.
#[wasm_bindgen]
pub fn simulate(start_src: &str, model_src: &str, max_steps: usize, data: JsValue, on_progress: Option<js_sys::Function>) -> JsValue {
    let result = match serde_wasm_bindgen::from_value::<Vec<DataSeries>>(data) {
        Ok(data) => {
            let mut progress = |steps: usize| {
                if let Some(callback) = &on_progress {
                    let _ = callback.call1(&JsValue::NULL, &JsValue::from(steps as f64));
                }
            };
            run_with_progress(start_src, model_src, max_steps, &data, &mut progress)
        }
        Err(e) => failed(error(
            Pos { block: "start", line: 1, column: 1 },
            "invalid_data",
            &[],
            format!("invalid measured data: {e}"),
        )),
    };
    to_js(&result)
}

fn to_js(result: &RunResult) -> JsValue {
    let object = js_sys::Object::new();
    let set = |key: &str, value: &JsValue| {
        js_sys::Reflect::set(&object, &JsValue::from_str(key), value).unwrap();
    };
    let plain = serde_wasm_bindgen::Serializer::new().serialize_maps_as_objects(true);
    set("ok", &JsValue::from_bool(result.ok));
    set("stopped", &JsValue::from_bool(result.stopped));
    set("errors", &result.errors.serialize(&plain).unwrap());
    let names = js_sys::Array::new();
    for name in &result.names {
        names.push(&JsValue::from_str(name));
    }
    set("names", &names);
    // Typed arrays, so the app can hand them between threads without copying
    let columns = js_sys::Array::new();
    for column in &result.columns {
        columns.push(&js_sys::Float64Array::from(column.as_slice()));
    }
    set("columns", &columns);
    set("firstNonFinite", &match &result.first_non_finite {
        Some(found) => found.serialize(&plain).unwrap(),
        None => JsValue::NULL,
    });
    object.into()
}

#[derive(Serialize)]
struct LanguageFunction {
    name: &'static str,
    /// "1", "2" or "1+" (one or more)
    args: String,
}

#[derive(Serialize)]
struct Language {
    functions: Vec<LanguageFunction>,
    keywords: &'static [&'static str],
    constants: Vec<&'static str>,
}

/// The built-in functions, keywords and constants, for the editor's highlighting and autocomplete
#[wasm_bindgen]
pub fn language() -> JsValue {
    let language = Language {
        functions: FUNCTIONS
            .iter()
            .map(|f| LanguageFunction {
                name: f.name,
                args: match f.max {
                    Some(max) if max == f.min => f.min.to_string(),
                    _ => format!("{}+", f.min),
                },
            })
            .collect(),
        keywords: KEYWORDS,
        constants: CONSTANTS.iter().map(|(name, _)| *name).collect(),
    };
    serde_wasm_bindgen::to_value(&language).unwrap()
}

pub fn run_source(start_src: &str, model_src: &str, max_steps: usize) -> RunResult {
    run_source_with_data(start_src, model_src, max_steps, &[])
}

pub fn run_source_with_data(start_src: &str, model_src: &str, max_steps: usize, data: &[DataSeries]) -> RunResult {
    run_with_progress(start_src, model_src, max_steps, data, &mut |_| {})
}

/// Whether the program assigns `name` anywhere, including inside `als` blocks
fn assigns(program: &pest::iterators::Pairs<Rule>, name: &str) -> bool {
    program
        .clone()
        .flatten()
        .any(|p| p.as_rule() == Rule::assignment && p.into_inner().next().unwrap().as_str() == name)
}

pub fn run_with_progress(
    start_src: &str,
    model_src: &str,
    max_steps: usize,
    data: &[DataSeries],
    progress: &mut dyn FnMut(usize),
) -> RunResult {
    let start = match indent_to_braces(start_src) {
        Ok(result) => result,
        Err(e) => return failed(indent_error(e, "start")),
    };
    let model = match indent_to_braces(model_src) {
        Ok(result) => result,
        Err(e) => return failed(indent_error(e, "model")),
    };

    let start_pairs = match PhysicsGoParser::parse(Rule::program, &start.braced) {
        Ok(mut p) => p.next().unwrap().into_inner(),
        Err(e) => return failed(map_pest_error(e, &start.line_map, "start")),
    };
    let model_pairs = match PhysicsGoParser::parse(Rule::program, &model.braced) {
        Ok(mut p) => p.next().unwrap().into_inner(),
        Err(e) => return failed(map_pest_error(e, &model.line_map, "model")),
    };

    // Compile once: variables get slots in the order the code assigns them
    let mut slots = Slots::new();
    collect_assigned(&start_pairs, &mut slots);
    collect_assigned(&model_pairs, &mut slots);
    // Models that don't advance time themselves get t = t + dt after every step;
    // models that do (t = t + dt, t += dt) must not advance twice
    let advance_time = !assigns(&model_pairs, "t");
    let start_block = Block { name: "start", line_map: &start.line_map };
    let model_block = Block { name: "model", line_map: &model.line_map };
    let start_code = match compile_block(start_pairs, &start_block, &mut slots) {
        Ok(code) => code,
        Err(e) => return failed(e),
    };
    let model_code = match compile_block(model_pairs, &model_block, &mut slots) {
        Ok(code) => code,
        Err(e) => return failed(e),
    };
    let t_slot = slots.slot("t");
    let dt_slot = slots.find("dt");
    let data_slots: Vec<(usize, &DataSeries)> = data.iter().map(|s| (slots.slot(&s.name), s)).collect();

    let names = slots.names;
    let count = names.len();
    let mut is_data = vec![false; count];
    for (slot, _) in &data_slots {
        is_data[*slot] = true;
    }
    let mut machine = Machine { names: &names, values: vec![0.0; count], defined: vec![false; count] };
    let mut recorder = Recorder { columns: vec![Vec::new(); count], ever_defined: vec![false; count], first_non_finite: None };
    let mut error = None;
    let mut stopped = false;

    'run: {
        if let Err(e) = machine.run(&start_code) {
            error = Some(e);
            break 'run;
        }
        // Measured data follows t: it's refreshed before every step and recorded with it
        set_data(&mut machine, t_slot, &data_slots);
        recorder.record(&machine, &is_data, 0);

        for step in 1..=max_steps {
            let result = match machine.run(&model_code) {
                Ok(result) => result,
                Err(e) => {
                    error = Some(e);
                    break 'run;
                }
            };
            // Every step, including the one that stops, moves the whole state one dt ahead,
            // so the recorded t always matches the values the model computed for it
            if advance_time {
                let dt = dt_slot.filter(|&s| machine.defined[s]).map_or(0.0, |s| machine.values[s]);
                let t = if machine.defined[t_slot] { machine.values[t_slot] } else { 0.0 };
                machine.set(t_slot, t + dt);
            }
            set_data(&mut machine, t_slot, &data_slots);
            recorder.record(&machine, &is_data, step);
            if step % PROGRESS_EVERY == 0 {
                progress(step);
            }
            if let StepResult::Stop = result {
                stopped = true;
                break 'run;
            }
        }
    }

    // Names the code only read (and never gave a value) aren't results
    let Recorder { columns, ever_defined, first_non_finite } = recorder;
    let (names, columns): (Vec<String>, Vec<Vec<f64>>) = names
        .into_iter()
        .zip(columns)
        .zip(ever_defined)
        .filter(|(_, defined)| *defined)
        .map(|(pair, _)| pair)
        .unzip();
    RunResult { ok: error.is_none(), names, columns, errors: error.into_iter().collect(), stopped, first_non_finite }
}

fn set_data(machine: &mut Machine, t_slot: usize, data: &[(usize, &DataSeries)]) {
    let t = if machine.defined[t_slot] { machine.values[t_slot] } else { f64::NAN };
    for (slot, series) in data {
        machine.set(*slot, series.at(t));
    }
}

struct Recorder {
    columns: Vec<Vec<f64>>,
    ever_defined: Vec<bool>,
    first_non_finite: Option<NonFinite>,
}

impl Recorder {
    /// Adds the current values as a row; a variable without a value yet is recorded as NaN
    fn record(&mut self, machine: &Machine, is_data: &[bool], step: usize) {
        for (slot, column) in self.columns.iter_mut().enumerate() {
            let defined = machine.defined[slot];
            let value = if defined { machine.values[slot] } else { f64::NAN };
            column.push(value);
            if defined {
                self.ever_defined[slot] = true;
                if self.first_non_finite.is_none() && !is_data[slot] && !value.is_finite() {
                    self.first_non_finite = Some(NonFinite { name: machine.names[slot].clone(), step });
                }
            }
        }
    }
}

fn indent_error(e: indent::IndentError, block: &'static str) -> RunError {
    error(Pos { block, line: e.line, column: 1 }, e.code, &[], e.message)
}

// Grammar rules as short codes the app translates, with the English wording
fn describe_rule(rule: &Rule) -> (&'static str, &'static str) {
    match rule {
        Rule::expr | Rule::term | Rule::unary | Rule::power | Rule::atom => ("value", "a value or calculation"),
        Rule::number => ("number", "a number"),
        Rule::identifier => ("name", "a variable name"),
        Rule::function_call => ("function", "a function"),
        Rule::assign_op => ("assign", "'=' (or '+=', '-=', '*=', '/=')"),
        Rule::comparison_op => ("comparison", "a comparison (<, >, <=, >=, ==, !=)"),
        Rule::statement | Rule::assignment => ("statement", "a line like 'x = 5'"),
        Rule::if_stmt | Rule::if_kw => ("if", "'als ...:'"),
        Rule::stop_stmt | Rule::stop_kw => ("stop", "'stop als ...'"),
        Rule::else_kw | Rule::else_clause | Rule::else_if_clause => ("else", "'anders:' or 'anders als ...:'"),
        Rule::condition | Rule::or_cond | Rule::and_cond | Rule::not_cond | Rule::comparison => {
            ("condition", "a condition such as 'x <= 0'")
        }
        Rule::and_kw | Rule::or_kw | Rule::not_kw => ("logic", "'en', 'of' or 'niet'"),
        Rule::add | Rule::sub | Rule::mul | Rule::div | Rule::pow_op | Rule::sub_op => ("operator", "an operator (+, -, *, /, ^)"),
        Rule::block => ("block", "an indented block"),
        Rule::EOI => ("end", "the end of the line"),
        Rule::program | Rule::WHITESPACE | Rule::COMMENT | Rule::keyword | Rule::ident_char => ("other", "something else"),
    }
}

fn map_pest_error(err: pest::error::Error<Rule>, line_map: &[SourcePos], block: &'static str) -> RunError {
    let (braced_line, column) = match err.line_col {
        pest::error::LineColLocation::Pos((l, c)) => (l, c),
        pest::error::LineColLocation::Span((l, c), _) => (l, c),
    };
    let codes = |rules: &[Rule]| {
        let mut codes: Vec<&'static str> = Vec::new();
        for rule in rules {
            let (code, _) = describe_rule(rule);
            if !codes.contains(&code) {
                codes.push(code);
            }
        }
        codes.join(",")
    };
    let (code, params) = match &err.variant {
        pest::error::ErrorVariant::ParsingError { positives, .. } if !positives.is_empty() => {
            ("expected", vec![("expected", codes(positives))])
        }
        pest::error::ErrorVariant::ParsingError { negatives, .. } => ("unexpected", vec![("unexpected", codes(negatives))]),
        pest::error::ErrorVariant::CustomError { .. } => ("syntax", vec![]),
    };
    let message = err.renamed_rules(|rule| describe_rule(rule).1.to_string()).variant.message().into_owned();
    let pos = match line_map.get(braced_line.saturating_sub(1)) {
        Some(p) => Pos { block, line: p.line, column: column + p.indent },
        // Past the last line: point just after the block's final line
        None => Pos { block, line: line_map.last().map_or(1, |p| p.line), column: 1 },
    };
    error(pos, code, &params, message)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    // Every variable's value after the last recorded step
    fn final_state(start: &str, model: &str, steps: usize) -> HashMap<String, f64> {
        let result = run_source(start, model, steps);
        assert!(result.ok, "unexpected errors: {:?}", result.errors);
        result.names.iter().cloned().zip(result.columns.iter().map(|c| *c.last().unwrap())).collect()
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
    fn blank_lines_inside_a_block_are_just_blank_lines() {
        // Start values and model rules come from separate editors, so spacing never moves a line between them
        let state = final_state("t = 0\n\ndt = 0.5\n\nx = 0\n", "x = x + 1\n\nstop als t >= 1", 10);
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
    fn else_and_else_if() {
        let model = "als x > 10:\n    k = 1\nanders als x > 5:\n    k = 2\nanders:\n    k = 3\nstop als t >= 0";
        assert_eq!(final_state("t = 0\nx = 20\n", model, 5)["k"], 1.0);
        assert_eq!(final_state("t = 0\nx = 7\n", model, 5)["k"], 2.0);
        assert_eq!(final_state("t = 0\nx = 1\n", model, 5)["k"], 3.0);
        // English keywords work too
        let english = "if x > 5:\n    k = 1\nelse:\n    k = 2\nstop if t >= 0";
        assert_eq!(final_state("t = 0\nx = 1\n", english, 5)["k"], 2.0);
    }

    #[test]
    fn else_needs_an_if() {
        let e = error_of("x = 1\nanders:\n    x = 2\n", "");
        assert_eq!(e.line, 2);
    }

    #[test]
    fn logic_in_conditions() {
        let model = "als x > 0 en y > 0:\n    q = 1\nals x < 0 of niet (y > 0):\n    r = 1\nstop als (x > 0 en y > 0) of t > 5";
        let state = final_state("t = 0\nx = 1\ny = -1\nq = 0\nr = 0\n", model, 3);
        assert_eq!((state["q"], state["r"]), (0.0, 1.0));
        // A condition can still start with a parenthesised calculation
        assert_eq!(final_state("t = 0\nx = 1\nq = 0\n", "als (x + 1) * 2 > 3:\n    q = 1\nstop als t >= 0", 3)["q"], 1.0);
        // en binds tighter than of
        let state = final_state("t = 0\nq = 0\n", "als 1 > 2 en 1 > 2 of 3 > 2:\n    q = 1\nstop als t >= 0", 1);
        assert_eq!(state["q"], 1.0);
    }

    #[test]
    fn constants_and_functions_with_several_values() {
        let state = final_state(
            "a = pi\nb = e\nc = atan2(1, 1)\nd = max(3, 7, 5)\nf = min(2, -1)\ng = hypot(3, 4)\nh = round(2.5)\nk = sign(-3)\n",
            "",
            0,
        );
        assert_eq!(state["a"], std::f64::consts::PI);
        assert_eq!(state["b"], std::f64::consts::E);
        assert_eq!(state["c"], std::f64::consts::FRAC_PI_4);
        assert_eq!((state["d"], state["f"], state["g"], state["h"], state["k"]), (7.0, -1.0, 5.0, 3.0, -1.0));
        // A model's own e (the elementary charge) replaces the constant, even before it's assigned
        assert_eq!(final_state("q = 2\ne = 1.6e-19\nlading = q * e\n", "", 0)["lading"], 3.2e-19);
    }

    #[test]
    fn wrong_number_of_values_is_reported_before_running() {
        let e = error_of("x = 1\n", "als x > 100:\n    y = atan2(1)\nstop als x > 0");
        assert_eq!((e.code, e.line), ("wrong_arguments", 2));
        assert_eq!(e.params["expected"], "2");
        assert_eq!(e.params["given"], "1");
    }

    #[test]
    fn syntax_errors_point_at_the_users_line() {
        let e = error_of("t = 0\n\ndt = 0.01 // seconds\nh = 20 +\n", "");
        assert_eq!((e.block, e.line), ("start", 4));
        assert!(e.message.contains("value or calculation"), "{}", e.message);
        assert_eq!(e.code, "expected");
        assert!(e.params["expected"].contains("value"), "{:?}", e.params);
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
        assert_eq!((e.code, e.params["name"].as_str()), ("no_value", "G"));
    }

    #[test]
    fn unknown_function_is_an_error_not_a_panic() {
        let e = error_of("x = foo(2)\n", "");
        assert!(e.message.contains("unknown function 'foo'"), "{}", e.message);
        assert_eq!(e.code, "unknown_function");
    }

    #[test]
    fn indentation_errors() {
        assert!(error_of("x = 1\n  y = 2\n", "").message.contains("unexpected indentation"));
        assert!(error_of("x = 1\nals x > 0:\ny = 2\n", "").message.contains("expected an indented line"));
        assert!(error_of("x = 1\nals x > 0:\n", "").message.contains("expected an indented line"));
        let e = error_of("x = 1\nals x > 0:\n    y = 2\n  z = 3\n", "");
        assert_eq!(e.line, 4);
        assert_eq!(e.code, "indent_mismatch");
    }

    fn series(name: &str, t: &[f64], values: &[f64]) -> DataSeries {
        DataSeries { name: name.into(), t: t.to_vec(), values: values.to_vec() }
    }

    #[test]
    fn measured_data_is_interpolated_at_t() {
        let data = [series("y_video1", &[0.0, 1.0, 2.0], &[10.0, 20.0, 40.0])];
        let result = run_source_with_data("t = 0\ndt = 0.5\n", "verschil = y_video1 - 10\nstop als t >= 1.5", 10, &data);
        assert!(result.ok, "{:?}", result.errors);
        assert_eq!(result.column("y_video1").unwrap(), [10.0, 15.0, 20.0, 30.0, 40.0]);
        // The model reads the value at the start of its step
        assert_eq!(result.column("verschil").unwrap()[2], 5.0);
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
    fn reports_whether_the_stop_condition_ended_the_run() {
        let stopped = run_source("t = 0\ndt = 1\n", "stop als t >= 3", 10);
        assert!(stopped.ok && stopped.stopped);
        // The condition sees t = 3 on the fourth step, which still moves t on: t = 0 through 4
        assert_eq!(stopped.rows(), 5);

        let limit = run_source("t = 0\ndt = 1\n", "stop als t >= 100", 10);
        assert!(limit.ok && !limit.stopped);
        assert_eq!(limit.rows(), 11);

        // Stopping on the very last allowed step still counts as stopping
        let last_step = run_source("t = 0\ndt = 1\n", "stop als t >= 9", 10);
        assert!(last_step.stopped);
        assert_eq!(last_step.rows(), 11);
    }

    #[test]
    fn finds_the_first_variable_without_a_valid_value() {
        let result = run_source("t = 0\ndt = 1\nx = 2\n", "x = x - 1\ny = sqrt(x)\nstop als t >= 5", 10);
        let found = result.first_non_finite.unwrap();
        assert_eq!((found.name.as_str(), found.step), ("y", 3));
        // Measured data outside its range doesn't count, and variables before they get a value don't either
        let data = [series("x_video1", &[5.0, 6.0], &[1.0, 2.0])];
        let result = run_source_with_data("t = 0\ndt = 1\n", "als t > 1:\n    z = 1\nstop als t >= 3", 10, &data);
        assert!(result.first_non_finite.is_none());
    }

    #[test]
    fn only_variables_that_got_a_value_are_results() {
        let result = run_source("t = 0\ndt = 1\n", "als t > 100:\n    q = 1\nstop als t >= 2", 10);
        assert!(result.column("q").is_none());
        assert!(result.column("t").is_some());
    }

    #[test]
    fn keywords_are_not_variable_names() {
        assert!(!run_source("als = 1\n", "", 0).ok);
        assert!(!run_source("of = 1\n", "", 0).ok);
        // ...but names that merely start with one are fine
        let state = final_state("alsof = 1\nstoptijd = 2\nenergie = 3\n", "", 0);
        assert_eq!((state["stoptijd"], state["energie"]), (2.0, 3.0));
    }

    #[test]
    fn progress_is_reported_during_long_runs() {
        let mut reports = Vec::new();
        run_with_progress("t = 0\ndt = 1\n", "", 50_000, &[], &mut |steps| reports.push(steps));
        assert_eq!(reports, [20_000, 40_000]);
    }
}
