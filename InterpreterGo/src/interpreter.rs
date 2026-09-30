use crate::indent::SourcePos;
use crate::Rule;
use pest::iterators::{Pair, Pairs};
use serde::Serialize;
use std::collections::{BTreeMap, HashMap};

/// A problem in the student's code: a `code` the app translates (with `params`), and the same
/// in English as `message`. Line and column are in the student's own block.
#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct RunError {
    pub line: usize,
    pub column: usize,
    pub block: &'static str,
    pub code: &'static str,
    pub params: BTreeMap<&'static str, String>,
    pub message: String,
}

impl RunError {
    pub fn new(pos: Pos, code: &'static str, params: &[(&'static str, String)], message: String) -> RunError {
        RunError {
            line: pos.line,
            column: pos.column,
            block: pos.block,
            code,
            params: params.iter().cloned().collect(),
            message,
        }
    }
}

/// Where something is in the student's code
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Pos {
    pub block: &'static str,
    pub line: usize,
    pub column: usize,
}

/// Which block is being compiled and how its braced lines map back to the student's lines
pub struct Block<'a> {
    pub name: &'static str,
    pub line_map: &'a [SourcePos],
}

impl Block<'_> {
    pub fn pos(&self, pair: &Pair<Rule>) -> Pos {
        let (line, column) = pair.line_col();
        match self.line_map.get(line.saturating_sub(1)) {
            Some(p) => Pos { block: self.name, line: p.line, column: column + p.indent },
            None => Pos { block: self.name, line, column },
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub enum Func {
    Sin, Cos, Tan, Asin, Acos, Atan, Atan2, Sqrt, Abs, Exp, Ln, Log, Floor, Ceil, Round, Sign, Pow, Min, Max,
}

/// Every built-in function: name, the function, and how many arguments it takes (max None: any number)
pub const FUNCTIONS: &[(&str, Func, usize, Option<usize>)] = &[
    ("sin", Func::Sin, 1, Some(1)),
    ("cos", Func::Cos, 1, Some(1)),
    ("tan", Func::Tan, 1, Some(1)),
    ("asin", Func::Asin, 1, Some(1)),
    ("acos", Func::Acos, 1, Some(1)),
    ("atan", Func::Atan, 1, Some(1)),
    ("atan2", Func::Atan2, 2, Some(2)),
    ("sqrt", Func::Sqrt, 1, Some(1)),
    ("abs", Func::Abs, 1, Some(1)),
    ("exp", Func::Exp, 1, Some(1)),
    ("ln", Func::Ln, 1, Some(1)),
    ("log", Func::Log, 1, Some(1)),
    ("floor", Func::Floor, 1, Some(1)),
    ("ceil", Func::Ceil, 1, Some(1)),
    ("round", Func::Round, 1, Some(2)),
    ("sign", Func::Sign, 1, Some(1)),
    ("pow", Func::Pow, 2, Some(2)),
    ("min", Func::Min, 2, None),
    ("max", Func::Max, 2, None),
];

/// Values every model starts with; the code can still give them another value
pub const CONSTANTS: &[(&str, f64)] = &[("pi", std::f64::consts::PI), ("e", std::f64::consts::E)];

/// The keywords, Dutch first with their English aliases
pub const KEYWORDS: &[&str] = &["als", "if", "anders", "else", "stop", "en", "and", "of", "or", "niet", "not"];

fn apply(func: Func, args: &[f64]) -> f64 {
    let a = args[0];
    match func {
        Func::Sin => a.sin(),
        Func::Cos => a.cos(),
        Func::Tan => a.tan(),
        Func::Asin => a.asin(),
        Func::Acos => a.acos(),
        Func::Atan => a.atan(),
        Func::Atan2 => a.atan2(args[1]),
        Func::Sqrt => a.sqrt(),
        Func::Abs => a.abs(),
        Func::Exp => a.exp(),
        Func::Ln => a.ln(),
        Func::Log => a.log10(),
        Func::Floor => a.floor(),
        Func::Ceil => a.ceil(),
        Func::Round => match args.get(1) {
            Some(&digits) => {
                let f = 10f64.powi(digits.round() as i32);
                (a * f).round() / f
            }
            None => a.round(),
        },
        Func::Sign => if a > 0.0 { 1.0 } else if a < 0.0 { -1.0 } else { 0.0 },
        Func::Pow => a.powf(args[1]),
        Func::Min => args.iter().copied().fold(f64::INFINITY, f64::min),
        Func::Max => args.iter().copied().fold(f64::NEG_INFINITY, f64::max),
    }
}

#[derive(Debug)]
enum Expr {
    Num(f64),
    Var(usize, Pos),
    Neg(Box<Expr>),
    Add(Box<Expr>, Box<Expr>),
    Sub(Box<Expr>, Box<Expr>),
    Mul(Box<Expr>, Box<Expr>),
    Div(Box<Expr>, Box<Expr>),
    Pow(Box<Expr>, Box<Expr>),
    Call(Func, Vec<Expr>),
}

#[derive(Debug, Clone, Copy)]
enum Cmp { Le, Ge, Eq, Ne, Lt, Gt }

#[derive(Debug)]
enum Cond {
    Cmp(Cmp, Expr, Expr),
    And(Box<Cond>, Box<Cond>),
    Or(Box<Cond>, Box<Cond>),
    Not(Box<Cond>),
}

#[derive(Debug, Clone, Copy)]
enum AssignOp { Set, Add, Sub, Mul, Div }

impl AssignOp {
    fn symbol(self) -> &'static str {
        match self { AssignOp::Set => "=", AssignOp::Add => "+=", AssignOp::Sub => "-=", AssignOp::Mul => "*=", AssignOp::Div => "/=" }
    }
}

#[derive(Debug)]
enum Stmt {
    Assign { slot: usize, op: AssignOp, expr: Expr, pos: Pos },
    // als / anders als branches in order, then what anders does (empty without anders)
    If { branches: Vec<(Cond, Vec<Stmt>)>, otherwise: Vec<Stmt> },
    Stop(Cond),
}

/// Turns parsed code into statements that refer to variables by number, once, before running
pub struct Compiler {
    pub names: Vec<String>,
    index: HashMap<String, usize>,
}

impl Compiler {
    pub fn new() -> Compiler {
        Compiler { names: Vec::new(), index: HashMap::new() }
    }

    pub fn slot(&mut self, name: &str) -> usize {
        if let Some(&i) = self.index.get(name) {
            return i;
        }
        self.names.push(name.to_string());
        self.index.insert(name.to_string(), self.names.len() - 1);
        self.names.len() - 1
    }

    fn program(&mut self, pairs: Pairs<Rule>, block: &Block) -> Result<Vec<Stmt>, RunError> {
        pairs.filter(|p| p.as_rule() == Rule::statement).map(|p| self.statement(p, block)).collect()
    }

    fn statement(&mut self, pair: Pair<Rule>, block: &Block) -> Result<Stmt, RunError> {
        let inner = pair.into_inner().next().unwrap();
        match inner.as_rule() {
            Rule::assignment => {
                let mut parts = inner.into_inner();
                let name = parts.next().unwrap();
                let pos = block.pos(&name);
                let slot = self.slot(name.as_str());
                let op = match parts.next().unwrap().as_str() {
                    "+=" => AssignOp::Add,
                    "-=" => AssignOp::Sub,
                    "*=" => AssignOp::Mul,
                    "/=" => AssignOp::Div,
                    _ => AssignOp::Set,
                };
                let expr = self.expr(parts.next().unwrap(), block)?;
                Ok(Stmt::Assign { slot, op, expr, pos })
            }
            Rule::if_stmt => {
                let mut branches = Vec::new();
                let mut otherwise = Vec::new();
                self.if_chain(inner, block, &mut branches, &mut otherwise)?;
                Ok(Stmt::If { branches, otherwise })
            }
            Rule::stop_stmt => {
                let cond = inner.into_inner().find(|p| p.as_rule() == Rule::condition).unwrap();
                Ok(Stmt::Stop(self.condition(cond, block)?))
            }
            _ => unreachable!(),
        }
    }

    // if_stmt and else_part: condition and block, then optionally another else_part
    fn if_chain(&mut self, pair: Pair<Rule>, block: &Block, branches: &mut Vec<(Cond, Vec<Stmt>)>, otherwise: &mut Vec<Stmt>) -> Result<(), RunError> {
        let mut cond = None;
        for part in pair.into_inner() {
            match part.as_rule() {
                Rule::condition => cond = Some(self.condition(part, block)?),
                Rule::block => {
                    let body = self.program(part.into_inner(), block)?;
                    match cond.take() {
                        Some(c) => branches.push((c, body)),
                        None => *otherwise = body,
                    }
                }
                Rule::else_part => self.if_chain(part, block, branches, otherwise)?,
                _ => {}
            }
        }
        Ok(())
    }

    fn condition(&mut self, pair: Pair<Rule>, block: &Block) -> Result<Cond, RunError> {
        match pair.as_rule() {
            Rule::condition | Rule::not_cond if pair.clone().into_inner().count() == 1 => {
                self.condition(pair.into_inner().next().unwrap(), block)
            }
            Rule::not_cond => {
                let inner = pair.into_inner().nth(1).unwrap();
                Ok(Cond::Not(Box::new(self.condition(inner, block)?)))
            }
            Rule::or_cond | Rule::and_cond => {
                let is_or = pair.as_rule() == Rule::or_cond;
                let mut parts = pair.into_inner().filter(|p| !matches!(p.as_rule(), Rule::or_kw | Rule::and_kw));
                let mut acc = self.condition(parts.next().unwrap(), block)?;
                for next in parts {
                    let rhs = Box::new(self.condition(next, block)?);
                    acc = if is_or { Cond::Or(Box::new(acc), rhs) } else { Cond::And(Box::new(acc), rhs) };
                }
                Ok(acc)
            }
            Rule::comparison => {
                let mut parts = pair.into_inner();
                let lhs = self.expr(parts.next().unwrap(), block)?;
                let op = match parts.next().unwrap().as_str() {
                    "<=" => Cmp::Le,
                    ">=" => Cmp::Ge,
                    "==" => Cmp::Eq,
                    "!=" => Cmp::Ne,
                    "<" => Cmp::Lt,
                    _ => Cmp::Gt,
                };
                let rhs = self.expr(parts.next().unwrap(), block)?;
                Ok(Cond::Cmp(op, lhs, rhs))
            }
            _ => unreachable!("unexpected rule in condition: {:?}", pair.as_rule()),
        }
    }

    fn expr(&mut self, pair: Pair<Rule>, block: &Block) -> Result<Expr, RunError> {
        match pair.as_rule() {
            Rule::expr | Rule::term => {
                let mut inner = pair.into_inner();
                let mut acc = self.expr(inner.next().unwrap(), block)?;
                while let Some(op) = inner.next() {
                    let rhs = Box::new(self.expr(inner.next().unwrap(), block)?);
                    let lhs = Box::new(acc);
                    acc = match op.as_rule() {
                        Rule::add => Expr::Add(lhs, rhs),
                        Rule::sub => Expr::Sub(lhs, rhs),
                        Rule::mul => Expr::Mul(lhs, rhs),
                        _ => Expr::Div(lhs, rhs),
                    };
                }
                Ok(acc)
            }
            Rule::power => {
                let mut inner = pair.into_inner();
                let base = self.expr(inner.next().unwrap(), block)?;
                match inner.next() {
                    Some(_) => Ok(Expr::Pow(Box::new(base), Box::new(self.expr(inner.next().unwrap(), block)?))),
                    None => Ok(base),
                }
            }
            Rule::unary => {
                let mut inner = pair.into_inner();
                let first = inner.next().unwrap();
                if first.as_rule() == Rule::sub_op {
                    Ok(Expr::Neg(Box::new(self.expr(inner.next().unwrap(), block)?)))
                } else {
                    self.expr(first, block)
                }
            }
            Rule::atom => self.expr(pair.into_inner().next().unwrap(), block),
            Rule::function_call => {
                let mut inner = pair.into_inner();
                let name = inner.next().unwrap();
                let pos = block.pos(&name);
                let args = inner.map(|a| self.expr(a, block)).collect::<Result<Vec<_>, _>>()?;
                let Some(&(_, func, min, max)) = FUNCTIONS.iter().find(|f| f.0 == name.as_str()) else {
                    let available = FUNCTIONS.iter().map(|f| f.0).collect::<Vec<_>>().join(", ");
                    return Err(RunError::new(pos, "unknown_function",
                        &[("name", name.as_str().into()), ("available", available.clone())],
                        format!("unknown function '{}'; available: {available}", name.as_str())));
                };
                if args.len() < min || max.is_some_and(|m| args.len() > m) {
                    let expected = match max {
                        Some(m) if m == min => min.to_string(),
                        Some(m) => format!("{min}-{m}"),
                        None => format!("{min}+"),
                    };
                    return Err(RunError::new(pos, "wrong_arguments",
                        &[("name", name.as_str().into()), ("expected", expected.clone()), ("given", args.len().to_string())],
                        format!("'{}' takes {expected} values, not {}", name.as_str(), args.len())));
                }
                Ok(Expr::Call(func, args))
            }
            Rule::number => Ok(Expr::Num(pair.as_str().parse().unwrap())),
            Rule::identifier => {
                let pos = block.pos(&pair);
                Ok(Expr::Var(self.slot(pair.as_str()), pos))
            }
            _ => unreachable!("unexpected rule in expr: {:?}", pair.as_rule()),
        }
    }
}

/// Measured values (e.g. points tracked in a video) that the code can read as a variable.
/// `t` is sorted ascending and has the same length as `values`.
#[derive(serde::Deserialize, Clone, Debug)]
pub struct DataSeries {
    pub name: String,
    pub t: Vec<f64>,
    pub values: Vec<f64>,
}

impl DataSeries {
    /// Linear interpolation at time `t`; NaN outside the measured range, so a
    /// calculation with it gives no value instead of a made-up one
    pub fn at(&self, t: f64) -> f64 {
        let (first, last) = match (self.t.first(), self.t.last()) {
            (Some(&first), Some(&last)) => (first, last),
            _ => return f64::NAN,
        };
        if !(t >= first && t <= last) {
            return f64::NAN;
        }
        // First sample at or after t
        let i = self.t.partition_point(|&ti| ti < t);
        if self.t[i] == t || i == 0 {
            return self.values[i];
        }
        let (t0, t1) = (self.t[i - 1], self.t[i]);
        let (v0, v1) = (self.values[i - 1], self.values[i]);
        v0 + (t - t0) / (t1 - t0) * (v1 - v0)
    }
}

#[derive(Serialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum StopReason {
    /// A `stop als` condition was met
    Condition,
    /// The maximum number of steps ran without the model stopping
    Limit,
    /// The code ran into an error
    Error,
}

/// A running model: the start values have run; `run` does model steps, in as many calls as the
/// caller likes (the app uses that to show progress and to stop a run).
pub struct Simulation {
    pub names: Vec<String>,
    model: Vec<Stmt>,
    data: Vec<(usize, DataSeries)>,
    values: Vec<f64>,
    defined: Vec<bool>,
    // Variables recorded per step: everything except constants the code never changes
    recorded: Vec<usize>,
    pub columns: Vec<Vec<f64>>,
    pub steps: usize,
    t_slot: usize,
    dt_slot: usize,
    advance_time: bool,
    pub finished: Option<StopReason>,
    pub error: Option<RunError>,
    /// The first variable that became NaN or infinite
    pub warning: Option<RunError>,
}

fn assigned_slots(stmts: &[Stmt], into: &mut Vec<usize>) {
    for s in stmts {
        match s {
            Stmt::Assign { slot, .. } => into.push(*slot),
            Stmt::If { branches, otherwise } => {
                for (_, body) in branches {
                    assigned_slots(body, into);
                }
                assigned_slots(otherwise, into);
            }
            Stmt::Stop(_) => {}
        }
    }
}

impl Simulation {
    /// Compiles both blocks (already parsed) and runs the start values
    pub fn new(start: Pairs<Rule>, model: Pairs<Rule>, start_block: &Block, model_block: &Block, data: Vec<DataSeries>) -> Result<Simulation, RunError> {
        let mut compiler = Compiler::new();
        let t_slot = compiler.slot("t");
        let dt_slot = compiler.slot("dt");
        let constant_slots: Vec<usize> = CONSTANTS.iter().map(|(name, _)| compiler.slot(name)).collect();
        let start = compiler.program(start, start_block)?;
        let model = compiler.program(model, model_block)?;
        let data: Vec<(usize, DataSeries)> = data.into_iter().map(|s| (compiler.slot(&s.name), s)).collect();

        let mut assigned = Vec::new();
        assigned_slots(&start, &mut assigned);
        assigned_slots(&model, &mut assigned);
        let mut model_assigned = Vec::new();
        assigned_slots(&model, &mut model_assigned);

        // Recorded per step: what the code gives a value, measured data, and t once time runs
        let n = compiler.names.len();
        let recorded = (0..n)
            .filter(|i| assigned.contains(i) || data.iter().any(|(s, _)| s == i) || (*i == t_slot && !model.is_empty()))
            .collect::<Vec<_>>();
        let mut sim = Simulation {
            names: compiler.names,
            model,
            data,
            values: vec![f64::NAN; n],
            defined: vec![false; n],
            columns: vec![Vec::new(); recorded.len()],
            recorded,
            steps: 0,
            t_slot,
            dt_slot,
            // Models that don't advance time themselves get t = t + dt after every step
            advance_time: !model_assigned.contains(&t_slot),
            finished: None,
            error: None,
            warning: None,
        };
        for (slot, (_, value)) in constant_slots.iter().zip(CONSTANTS) {
            sim.values[*slot] = *value;
            sim.defined[*slot] = true;
        }
        if let Err(e) = sim.exec(&start) {
            return Err(e);
        }
        // Measured data follows t: it's refreshed before every step and recorded with it
        sim.set_data();
        sim.record();
        Ok(sim)
    }

    /// Runs up to `count` more steps, never beyond `max_steps` in total. Returns whether it's finished.
    pub fn run(&mut self, max_steps: usize, count: usize) -> bool {
        let model = std::mem::take(&mut self.model);
        for _ in 0..count {
            if self.finished.is_some() {
                break;
            }
            if self.steps >= max_steps {
                self.finished = Some(StopReason::Limit);
                break;
            }
            let stop = match self.exec(&model) {
                Ok(stop) => stop,
                Err(e) => {
                    self.error = Some(e);
                    self.finished = Some(StopReason::Error);
                    break;
                }
            };
            // Every step, including the one that stops, moves the whole state one dt ahead,
            // so the recorded t always matches the values the model computed for it
            if self.advance_time {
                let dt = if self.defined[self.dt_slot] { self.values[self.dt_slot] } else { 0.0 };
                let t = if self.defined[self.t_slot] { self.values[self.t_slot] } else { 0.0 };
                self.values[self.t_slot] = t + dt;
                self.defined[self.t_slot] = true;
            }
            self.set_data();
            self.steps += 1;
            self.record();
            if stop {
                self.finished = Some(StopReason::Condition);
            }
        }
        if self.finished.is_none() && self.steps >= max_steps {
            self.finished = Some(StopReason::Limit);
        }
        self.model = model;
        self.finished.is_some()
    }

    /// The state after the last recorded step, by name (for tests and the command line)
    pub fn final_state(&self) -> HashMap<String, f64> {
        self.recorded.iter().enumerate()
            .filter_map(|(c, &slot)| self.columns[c].last().map(|&v| (self.names[slot].clone(), v)))
            .collect()
    }

    pub fn recorded_names(&self) -> Vec<String> {
        self.recorded.iter().map(|&s| self.names[s].clone()).collect()
    }

    fn set_data(&mut self) {
        let t = if self.defined[self.t_slot] { self.values[self.t_slot] } else { f64::NAN };
        for (slot, series) in &self.data {
            self.values[*slot] = series.at(t);
            self.defined[*slot] = true;
        }
    }

    fn record(&mut self) {
        for (c, &slot) in self.recorded.iter().enumerate() {
            self.columns[c].push(if self.defined[slot] { self.values[slot] } else { f64::NAN });
        }
    }

    // Runs statements; Ok(true) when a stop condition was met
    fn exec(&mut self, stmts: &[Stmt]) -> Result<bool, RunError> {
        for stmt in stmts {
            match stmt {
                Stmt::Assign { slot, op, expr, pos } => {
                    let value = self.eval(expr)?;
                    let new = match op {
                        AssignOp::Set => value,
                        _ => {
                            if !self.defined[*slot] {
                                let name = self.names[*slot].clone();
                                let symbol = op.symbol();
                                return Err(RunError::new(*pos, "compound_undefined",
                                    &[("name", name.clone()), ("op", symbol.into())],
                                    format!("'{name}' has no value yet, so '{symbol}' can't update it")));
                            }
                            let current = self.values[*slot];
                            match op {
                                AssignOp::Add => current + value,
                                AssignOp::Sub => current - value,
                                AssignOp::Mul => current * value,
                                _ => current / value,
                            }
                        }
                    };
                    if !new.is_finite() && self.warning.is_none() {
                        let name = self.names[*slot].clone();
                        let shown = if new.is_nan() { "NaN" } else if new > 0.0 { "Infinity" } else { "-Infinity" };
                        self.warning = Some(RunError::new(*pos, "not_finite",
                            &[("name", name.clone()), ("value", shown.into()), ("step", self.steps.to_string())],
                            format!("'{name}' became {shown} in step {}", self.steps)));
                    }
                    self.values[*slot] = new;
                    self.defined[*slot] = true;
                }
                Stmt::If { branches, otherwise } => {
                    let mut body = otherwise;
                    for (cond, branch) in branches {
                        if self.test(cond)? {
                            body = branch;
                            break;
                        }
                    }
                    if self.exec(body)? {
                        return Ok(true);
                    }
                }
                Stmt::Stop(cond) => {
                    if self.test(cond)? {
                        return Ok(true);
                    }
                }
            }
        }
        Ok(false)
    }

    fn test(&self, cond: &Cond) -> Result<bool, RunError> {
        Ok(match cond {
            Cond::Cmp(op, lhs, rhs) => {
                let (a, b) = (self.eval(lhs)?, self.eval(rhs)?);
                match op {
                    Cmp::Le => a <= b,
                    Cmp::Ge => a >= b,
                    Cmp::Eq => (a - b).abs() < 1e-12,
                    Cmp::Ne => (a - b).abs() >= 1e-12,
                    Cmp::Lt => a < b,
                    Cmp::Gt => a > b,
                }
            }
            Cond::And(a, b) => self.test(a)? && self.test(b)?,
            Cond::Or(a, b) => self.test(a)? || self.test(b)?,
            Cond::Not(a) => !self.test(a)?,
        })
    }

    fn eval(&self, expr: &Expr) -> Result<f64, RunError> {
        Ok(match expr {
            Expr::Num(v) => *v,
            Expr::Var(slot, pos) => {
                if !self.defined[*slot] {
                    let name = &self.names[*slot];
                    return Err(RunError::new(*pos, "undefined_variable", &[("name", name.clone())],
                        format!("'{name}' has no value yet; give it one before using it")));
                }
                self.values[*slot]
            }
            Expr::Neg(a) => -self.eval(a)?,
            Expr::Add(a, b) => self.eval(a)? + self.eval(b)?,
            Expr::Sub(a, b) => self.eval(a)? - self.eval(b)?,
            Expr::Mul(a, b) => self.eval(a)? * self.eval(b)?,
            Expr::Div(a, b) => self.eval(a)? / self.eval(b)?,
            Expr::Pow(a, b) => self.eval(a)?.powf(self.eval(b)?),
            Expr::Call(func, args) => {
                let values = args.iter().map(|a| self.eval(a)).collect::<Result<Vec<_>, _>>()?;
                apply(*func, &values)
            }
        })
    }
}
