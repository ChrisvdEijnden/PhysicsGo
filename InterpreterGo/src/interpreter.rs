use crate::indent::SourcePos;
use crate::{Rule, RunError};
use pest::iterators::{Pair, Pairs};
use std::collections::HashMap;

pub type Env = HashMap<String, f64>;

pub enum StepResult {
    Continue,
    Stop,
}

/// Which block is running and how its braced lines map back to the user's source,
/// so runtime errors point at the right line
pub struct Block<'a> {
    pub name: &'static str,
    pub line_map: &'a [SourcePos],
}

impl Block<'_> {
    pub fn error(&self, pair: &Pair<Rule>, message: String) -> RunError {
        let (line, column) = pair.line_col();
        match self.line_map.get(line.saturating_sub(1)) {
            Some(pos) => RunError { line: pos.line, column: column + pos.indent, message, block: self.name },
            None => RunError { line, column, message, block: self.name },
        }
    }
}

type Eval<T> = Result<T, RunError>;

fn call_function(name: &str, arg: f64) -> Option<f64> {
    Some(match name {
        "sin" => arg.sin(),
        "cos" => arg.cos(),
        "tan" => arg.tan(),
        "asin" => arg.asin(),
        "acos" => arg.acos(),
        "atan" => arg.atan(),
        "sqrt" => arg.sqrt(),
        "abs" => arg.abs(),
        "exp" => arg.exp(),
        "ln" => arg.ln(),
        "log" => arg.log10(),
        _ => return None,
    })
}

pub fn eval_expr(pair: Pair<Rule>, env: &Env, block: &Block) -> Eval<f64> {
    match pair.as_rule() {
        Rule::expr | Rule::term => {
            let mut inner = pair.into_inner();
            let mut acc = eval_expr(inner.next().unwrap(), env, block)?;
            while let Some(op) = inner.next() {
                let rhs = eval_expr(inner.next().unwrap(), env, block)?;
                acc = match op.as_rule() {
                    Rule::add => acc + rhs,
                    Rule::sub => acc - rhs,
                    Rule::mul => acc * rhs,
                    Rule::div => acc / rhs,
                    _ => unreachable!(),
                };
            }
            Ok(acc)
        }
        Rule::power => {
            let mut inner = pair.into_inner();
            let base = eval_expr(inner.next().unwrap(), env, block)?;
            match inner.next() {
                Some(_pow_op) => Ok(base.powf(eval_expr(inner.next().unwrap(), env, block)?)),
                None => Ok(base),
            }
        }
        Rule::unary => {
            let mut inner = pair.into_inner();
            let first = inner.next().unwrap();
            if first.as_rule() == Rule::sub_op {
                Ok(-eval_expr(inner.next().unwrap(), env, block)?)
            } else {
                eval_expr(first, env, block)
            }
        }
        Rule::atom => eval_expr(pair.into_inner().next().unwrap(), env, block),
        Rule::function_call => {
            let mut inner = pair.into_inner();
            let name_pair = inner.next().unwrap();
            let arg = eval_expr(inner.next().unwrap(), env, block)?;
            call_function(name_pair.as_str(), arg).ok_or_else(|| {
                block.error(
                    &name_pair,
                    format!(
                        "unknown function '{}'; available: sin, cos, tan, asin, acos, atan, sqrt, abs, exp, ln, log",
                        name_pair.as_str()
                    ),
                )
            })
        }
        Rule::number => Ok(pair.as_str().parse().unwrap()),
        Rule::identifier => env.get(pair.as_str()).copied().ok_or_else(|| {
            block.error(&pair, format!("'{}' has no value yet; give it one before using it", pair.as_str()))
        }),
        _ => unreachable!("unexpected rule in eval_expr: {:?}", pair.as_rule()),
    }
}

fn eval_condition(pair: Pair<Rule>, env: &Env, block: &Block) -> Eval<bool> {
    let mut inner = pair.into_inner();
    let lhs = eval_expr(inner.next().unwrap(), env, block)?;
    let op = inner.next().unwrap().as_str();
    let rhs = eval_expr(inner.next().unwrap(), env, block)?;
    Ok(match op {
        "<=" => lhs <= rhs,
        ">=" => lhs >= rhs,
        "==" => (lhs - rhs).abs() < 1e-12,
        "!=" => (lhs - rhs).abs() >= 1e-12,
        "<" => lhs < rhs,
        ">" => lhs > rhs,
        _ => unreachable!(),
    })
}

pub fn run_statements(pairs: Pairs<Rule>, env: &mut Env, block: &Block) -> Eval<StepResult> {
    for pair in pairs {
        if pair.as_rule() != Rule::statement {
            continue;
        }
        let inner = pair.into_inner().next().unwrap();
        match inner.as_rule() {
            Rule::assignment => {
                let mut parts = inner.into_inner();
                let name_pair = parts.next().unwrap();
                let op = parts.next().unwrap().as_str();
                let value = eval_expr(parts.next().unwrap(), env, block)?;
                let name = name_pair.as_str();

                let new_value = if op == "=" {
                    value
                } else {
                    let current = env.get(name).copied().ok_or_else(|| {
                        block.error(&name_pair, format!("'{name}' has no value yet, so '{op}' can't update it"))
                    })?;
                    match op {
                        "+=" => current + value,
                        "-=" => current - value,
                        "*=" => current * value,
                        "/=" => current / value,
                        _ => unreachable!(),
                    }
                };
                env.insert(name.to_string(), new_value);
            }
            Rule::if_stmt => {
                let mut parts = inner.into_inner();
                parts.next(); // als
                let cond = parts.next().unwrap();
                if eval_condition(cond, env, block)? {
                    if let StepResult::Stop = run_statements(parts, env, block)? {
                        return Ok(StepResult::Stop);
                    }
                }
            }
            Rule::stop_stmt => {
                let mut parts = inner.into_inner();
                parts.next(); // stop
                parts.next(); // als
                let cond = parts.next().unwrap();
                if eval_condition(cond, env, block)? {
                    return Ok(StepResult::Stop);
                }
            }
            _ => unreachable!(),
        }
    }
    Ok(StepResult::Continue)
}

/// Whether the program assigns `name` anywhere, including inside `als` blocks
fn assigns(program: &Pairs<Rule>, name: &str) -> bool {
    program
        .clone()
        .flatten()
        .any(|p| p.as_rule() == Rule::assignment && p.into_inner().next().unwrap().as_str() == name)
}

/// Runs the start block once, then the model block up to `max_steps` times.
/// Returns the state after the start block and after every step; on a runtime
/// error, the states up to that point plus the error.
pub fn run_simulation(
    start_program: Pairs<Rule>,
    model_program: Pairs<Rule>,
    max_steps: usize,
    start_block: &Block,
    model_block: &Block,
) -> (Vec<Env>, Option<RunError>) {
    let mut env: Env = Env::new();
    let mut geschiedenis: Vec<Env> = Vec::new();

    if let Err(e) = run_statements(start_program, &mut env, start_block) {
        return (geschiedenis, Some(e));
    }
    geschiedenis.push(env.clone());

    // Models that don't advance time themselves get t = t + dt after every step;
    // models that do (t = t + dt, t += dt) must not advance twice
    let advance_time = !assigns(&model_program, "t");

    for _ in 0..max_steps {
        let result = match run_statements(model_program.clone(), &mut env, model_block) {
            Ok(result) => result,
            Err(e) => return (geschiedenis, Some(e)),
        };

        let stop = matches!(result, StepResult::Stop);
        // No advance on the stopping step, so `stop als t >= 10` ends at t = 10, not 10 + dt
        if advance_time && !stop {
            let dt = env.get("dt").copied().unwrap_or(0.0);
            let t = env.get("t").copied().unwrap_or(0.0) + dt;
            env.insert("t".to_string(), t);
        }

        geschiedenis.push(env.clone());

        if stop {
            break;
        }
    }

    (geschiedenis, None)
}
