use pest::Parser;
use pest_derive::Parser;
use serde::Serialize;
use wasm_bindgen::prelude::*;

pub mod indent;
pub mod interpreter;

use indent::indent_to_braces;
use interpreter::{run_simulation, Env};

#[derive(Parser)]
#[grammar = "grammar.pest"]
pub struct PhysicsGoParser;

#[derive(Serialize)]
pub struct RunError {
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

pub fn run_source(start_src: &str, model_src: &str, max_steps: usize) -> RunResult {
    let start = indent_to_braces(start_src);
    let model = indent_to_braces(model_src);

    let start_pairs = match PhysicsGoParser::parse(Rule::program, &start.braced) {
        Ok(mut p) => p.next().unwrap().into_inner(),
        Err(e) => {
            return RunResult { ok: false, history: vec![], errors: vec![map_pest_error(e, &start.line_map, "start")] };
        }
    };
    let model_pairs = match PhysicsGoParser::parse(Rule::program, &model.braced) {
        Ok(mut p) => p.next().unwrap().into_inner(),
        Err(e) => {
            return RunResult { ok: false, history: vec![], errors: vec![map_pest_error(e, &model.line_map, "model")] };
        }
    };

    let history = run_simulation(start_pairs, model_pairs, max_steps);
    RunResult { ok: true, history, errors: vec![] }
}

fn map_pest_error(err: pest::error::Error<Rule>, line_map: &[usize], block: &'static str) -> RunError {
    let (processed_line, column) = match err.line_col {
        pest::error::LineColLocation::Pos((l, c)) => (l, c),
        pest::error::LineColLocation::Span((l, c), _) => (l, c),
    };
    let original_line = line_map.get(processed_line.saturating_sub(1)).copied().unwrap_or(processed_line);
    RunError { line: original_line, column, message: err.to_string(), block }
}