use crate::Rule;
use pest::iterators::{Pair, Pairs};
use std::collections::HashMap;

pub type Env = HashMap<String, f64>;

pub enum StepResult {
    Continue,
    Stop,
}

pub fn eval_expr(pair: Pair<Rule>, env: &Env) -> f64 {
    match pair.as_rule() {
        Rule::expr => {
            let mut inner = pair.into_inner();
            let mut acc = eval_expr(inner.next().unwrap(), env);
            while let Some(op) = inner.next() {
                let rhs = eval_expr(inner.next().unwrap(), env);
                acc = match op.as_rule() {
                    Rule::add => acc + rhs,
                    Rule::sub => acc - rhs,
                    _ => unreachable!(),
                };
            }
            acc
        }
        Rule::term => {
            let mut inner = pair.into_inner();
            let mut acc = eval_expr(inner.next().unwrap(), env);
            while let Some(op) = inner.next() {
                let rhs = eval_expr(inner.next().unwrap(), env);
                acc = match op.as_rule() {
                    Rule::mul => acc * rhs,
                    Rule::div => acc / rhs,
                    _ => unreachable!(),
                };
            }
            acc
        }
        Rule::power => {
            let mut inner = pair.into_inner();
            let base = eval_expr(inner.next().unwrap(), env);
            match inner.next() {
                Some(_op) => base.powf(eval_expr(inner.next().unwrap(), env)),
                None => base,
            }
        }
        Rule::unary => {
            let mut inner = pair.into_inner();
            let first = inner.next().unwrap();
            if first.as_rule() == Rule::sub_op {
                -eval_expr(inner.next().unwrap(), env)
            } else {
                eval_expr(first, env)
            }
        }
        Rule::atom => eval_expr(pair.into_inner().next().unwrap(), env),
        Rule::function_call => {
            let mut inner = pair.into_inner();
            let name = inner.next().unwrap().as_str();
            let arg = eval_expr(inner.next().unwrap(), env);
            match name {
                "sin" => arg.sin(),
                "cos" => arg.cos(),
                "sqrt" => arg.sqrt(),
                _ => panic!("unknown function: {}", name),
            }
        }
        Rule::number => pair.as_str().parse().unwrap(),
        Rule::identifier => *env.get(pair.as_str()).unwrap_or(&0.0),
        _ => unreachable!("unexpected rule in eval_expr: {:?}", pair.as_rule()),
    }
}

fn eval_condition(pair: Pair<Rule>, env: &Env) -> bool {
    let mut inner = pair.into_inner();
    let lhs = eval_expr(inner.next().unwrap(), env);
    let op = inner.next().unwrap().as_str();
    let rhs = eval_expr(inner.next().unwrap(), env);
    match op {
        "<=" => lhs <= rhs,
        ">=" => lhs >= rhs,
        "==" => (lhs - rhs).abs() < 1e-12,
        "!=" => (lhs - rhs).abs() >= 1e-12,
        "<" => lhs < rhs,
        ">" => lhs > rhs,
        _ => unreachable!(),
    }
}

pub fn run_statements(pairs: Pairs<Rule>, env: &mut Env) -> StepResult {
    for pair in pairs {
        if pair.as_rule() != Rule::statement {
            continue;
        }
        let inner = pair.into_inner().next().unwrap();
        match inner.as_rule() {
            Rule::assignment => {
                let mut parts = inner.into_inner();
                let name = parts.next().unwrap().as_str().to_string();
                let value = eval_expr(parts.next().unwrap(), env);
                env.insert(name, value);
            }
            Rule::if_stmt => {
                let mut parts = inner.into_inner();
                parts.next();
                let cond = parts.next().unwrap();
                if eval_condition(cond, env) {
                    if let StepResult::Stop = run_statements(parts, env) {
                        return StepResult::Stop;
                    }
                }
            }
            Rule::stop_stmt => {
                let mut parts = inner.into_inner();
                parts.next();
                parts.next();
                let cond = parts.next().unwrap();
                if eval_condition(cond, env) {
                    return StepResult::Stop;
                }
            }
            _ => unreachable!(),
        }
    }
    StepResult::Continue
}

pub fn run_simulation(
    start_program: Pairs<Rule>,
    model_program: Pairs<Rule>,
    max_steps: usize,
) -> Vec<Env> {
    let mut env: Env = Env::new();
    let mut geschiedenis: Vec<Env> = Vec::new();

    run_statements(start_program, &mut env);
    geschiedenis.push(env.clone());

    for _ in 0..max_steps {
        let result = run_statements(model_program.clone(), &mut env);

        let dt = *env.get("dt").unwrap_or(&0.0);
        let t = env.get("t").copied().unwrap_or(0.0) + dt;
        env.insert("t".to_string(), t);

        geschiedenis.push(env.clone());

        if let StepResult::Stop = result {
            break;
        }
    }

    geschiedenis
}